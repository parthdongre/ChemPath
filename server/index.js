import cors from "cors";
import express from "express";
import { ordStatus, ordSearch, ordReaction, ordNeighborhood } from "./ord-db.js";
import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const engineCandidates = process.platform === "win32"
  ? [
      path.join(repoRoot, "engine", "build", "Release", "chempath.exe"),
      path.join(repoRoot, "engine", "build", "chempath.exe")
    ]
  : [path.join(repoRoot, "engine", "build", "chempath")];

const enginePath = engineCandidates.find((candidate) => fs.existsSync(candidate))
  ?? engineCandidates[0];

const dataDir = process.env.CHEMPATH_DATA_DIR
  ? path.resolve(process.env.CHEMPATH_DATA_DIR)
  : path.join(repoRoot, "data");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Bounded, in-memory per-instance rate limiter for a small public demo.
// Reverse-proxy/CDN protection is recommended for a higher-traffic deployment.
const ipRequests = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Math.max(20, Math.min(1000, Number(process.env.API_RATE_LIMIT) || 120));
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  const now = Date.now();
  if (ipRequests.size > 20_000) ipRequests.clear();
  const key = req.ip || "unknown";
  const previous = ipRequests.get(key);
  const item = !previous || now >= previous.until
    ? { count: 0, until: now + RATE_WINDOW_MS } : previous;
  item.count += 1;
  ipRequests.set(key, item);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT);
  if (item.count > RATE_LIMIT) {
    res.setHeader("Retry-After", Math.ceil((item.until - now) / 1000));
    return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
  }
  next();
});

// Persistent C++ worker: one graph load, then JSON-line replies per command.
let worker = null;
const pending = [];
function failPending(error) {
  while (pending.length) {
    const request = pending.shift();
    clearTimeout(request.timer);
    request.reject(error);
  }
}
function startWorker() {
  if (worker) return worker;
  if (!fs.existsSync(enginePath)) {
    const error = new Error("C++ engine not found. Run: npm run build:engine");
    error.status = 503;
    throw error;
  }
  const child = spawn(enginePath, ["serve", "--data", dataDir], {
    cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"]
  });
  worker = child;
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const job = pending.shift();
    if (!job) return;
    clearTimeout(job.timer);
    try {
      const payload = JSON.parse(line);
      if (payload.ok === false) {
        const error = new Error(payload.error || "Engine command failed");
        error.status = 400;
        job.reject(error);
      } else job.resolve(payload);
    } catch {
      job.reject(new Error("Invalid engine response"));
    }
  });
  child.stderr.on("data", (chunk) => console.warn("[ChemPath engine]", String(chunk)));
  const stop = (cause) => {
    if (worker === child) worker = null;
    failPending(new Error("C++ engine stopped: " + cause));
  };
  child.on("error", (err) => stop(err.message));
  child.on("exit", (code) => stop("exit code " + code));
  return child;
}
function runEngine(args = []) {
  if (args.some((part) => /[\t\r\n]/.test(String(part)))) {
    const error = new Error("Invalid control characters in request");
    error.status = 400;
    return Promise.reject(error);
  }
  try {
    if (pending.length >= 16) {
      const error = new Error("Engine is busy. Please retry.");
      error.status = 429;
      return Promise.reject(error);
    }
    const child = startWorker();
    return new Promise((resolve, reject) => {
      const job = { resolve, reject, timer: null };
      pending.push(job);
      job.timer = setTimeout(() => {
        if (worker === child) { worker = null; child.kill(); }
        failPending(new Error("Engine request timed out; worker restarted"));
      }, 30000);
      child.stdin.write(args.map(String).join("\t") + "\n", (error) => {
        if (!error) return;
        if (worker === child) { worker = null; child.kill(); }
        failPending(error);
      });
    });
  } catch (error) { return Promise.reject(error); }
}

function route(handler) {
  return async (req, res) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.json(data);
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        error: error.message || "Unexpected server error"
      });
    }
  };
}

app.get("/api/health", route(async () => {
  const stats = await runEngine(["stats"]);
  return {
    ok: true,
    service: "ChemPath API",
    engine: "C++17",
    ...stats
  };
}));

app.get("/api/ord/status", route(async () => ordStatus()));
app.get("/api/ord/search", route(async (req) => ordSearch(req.query.q, req.query.limit)));
app.get("/api/ord/reaction/:id", route(async (req) => ordReaction(req.params.id)));
app.get("/api/ord/neighborhood", route(async (req) =>
  ordNeighborhood(req.query.smiles, req.query.limit)));

// Exact indexed traversal lives in C++, NOT the Node neighborhood renderer.
// A limited unsuccessful search is never claimed globally unreachable.
app.get("/api/ord/path", route(async (req) => {
  if (!ordStatus().available) {
    const e = new Error("ORD database not installed; import/index it first");
    e.status = 503;
    throw e;
  }
  const from = req.query.from, to = req.query.to;
  const safe = v => typeof v === "string" && v.length > 0 &&
    v.length <= 512 && !/[\x00-\x1f]/.test(v);
  const parseBound = (value, fallback, ceiling) => {
    if (value == null) return fallback;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > ceiling) {
      const e = new Error("ORD resource limits must be positive bounded integers");
      e.status = 400;
      throw e;
    }
    return n;
  };
  if (!safe(from) || !safe(to)) {
    const e = new Error("Specify exact source/target indexed SMILES");
    e.status = 400;
    throw e;
  }
  const maxExpanded = parseBound(req.query.maxExpanded, 2500, 10000);
  const maxVisited = parseBound(req.query.maxVisited, 20000, 50000);
  const maxNeighbors = parseBound(req.query.maxNeighbors, 25000, 100000);
  const cacheMB = parseBound(req.query.cacheMB, 8, 64);
  return runEngine(["ordpath", from, to, String(maxExpanded),
    String(maxVisited), String(maxNeighbors), String(cacheMB)]);
}));


// The AND-dependency model is separate from ordinary participation paths.
app.get("/api/feasible", route(async (req) => {
  const available = req.query.available;
  const target = req.query.target;
  if (typeof available !== "string" || !available.trim() || available.length > 2000 ||
      typeof target !== "string" || !target.trim() || target.length > 180) {
    const error = new Error("Expected available (semicolon-separated) and target compound names");
    error.status = 400;
    throw error;
  }
  return runEngine(["feasible", available, target]);
}));

// Constraints run entirely inside the C++ graph engine; the API only validates.
app.post("/api/path/constrained", route(async (req) => {
  const q = req.body ?? {};
  const name = (v) => typeof v === "string" && v.length >= 1 && v.length <= 180 &&
                         !/[\t\r\n]/.test(v);
  const ids = (v) => Array.isArray(v) && v.length <= 100 &&
                     v.every(n => Number.isSafeInteger(n) && n >= 0);
  const tags = (v) => Array.isArray(v) && v.length <= 30 &&
                     v.every(x => typeof x === "string" && x.length > 0 && x.length <= 100 &&
                                  !/[\t\r\n;]/.test(x));
  const count = q.k ?? 3;
  if (!name(q.source) || !name(q.target) || !Number.isInteger(count) ||
      count < 1 || count > 5 ||
      !ids(q.blockedReactionIds ?? []) || !ids(q.blockedCompoundIds ?? []) ||
      !tags(q.availableReagents ?? []) || !tags(q.availableCatalysts ?? []) ||
      !["allow","strict"].includes(q.unknownRequirements ?? "allow")) {
    const e = new Error("Invalid constrained search parameters");
    e.status = 400;
    throw e;
  }
  return runEngine(["constrained", q.source, q.target, String(count),
    (q.blockedReactionIds ?? []).join(","), (q.blockedCompoundIds ?? []).join(","),
    (q.availableReagents ?? []).join(";"), (q.availableCatalysts ?? []).join(";"),
    q.unknownRequirements ?? "allow"]);
}));

app.get("/api/path/pareto", route(async (req) => {
  const { from, to } = req.query;
  const objective = req.query.objective ?? "steps-cost";
  const maxLabels = req.query.maxLabels == null ? 50000 : Number(req.query.maxLabels);
  const maxRoutes = req.query.maxRoutes == null ? 10 : Number(req.query.maxRoutes);
  if (typeof from !== "string" || !from || from.length > 180 ||
      typeof to !== "string" || !to || to.length > 180 ||
      /[\t\r\n]/.test(from + to) ||
      !["steps-cost","steps-cost-reagents"].includes(objective) ||
      !Number.isInteger(maxLabels) || maxLabels < 1 || maxLabels > 100000 ||
      !Number.isInteger(maxRoutes) || maxRoutes < 1 || maxRoutes > 20) {
    const e = new Error("Invalid Pareto search parameters");
    e.status = 400;
    throw e;
  }
  return runEngine(["pareto", from, to, objective, String(maxLabels), String(maxRoutes)]);
}));

app.get("/api/stats", route(async () => runEngine(["stats"])));
app.get("/api/network", route(async () => runEngine(["network"])));

// Query-driven subgraph for the WebGL explorer: do not transfer every edge
// again for a neighborhood expansion. Cached snapshot is shared across users.
let graphCachePromise = null;
function readCachedGraph() {
  if (!graphCachePromise) {
    graphCachePromise = runEngine(["network"]).catch(error => {
      graphCachePromise = null;
      throw error;
    });
  }
  return graphCachePromise;
}
app.get("/api/graph/neighborhood", route(async (req) => {
  const center = String(req.query.center || "").trim().slice(0, 180);
  const depth = Number(req.query.depth ?? 1);
  const limit = Number(req.query.limit ?? 320);
  if (!center || !Number.isInteger(depth) || depth < 1 || depth > 3 ||
      !Number.isInteger(limit) || limit < 2 || limit > 1200) {
    const error = new Error("Provide center, depth 1-3, limit 2-1200");
    error.status = 400;
    throw error;
  }
  const graph = await readCachedGraph();
  const selected = graph.nodes.find(n => n.name.toLowerCase() === center.toLowerCase() ||
    String(n.id) === center);
  if (!selected) {
    const error = new Error("Compound not found"); error.status = 404; throw error;
  }
  const neighbors = new Map();
  for (const edge of graph.edges) {
    if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set());
    if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set());
    neighbors.get(edge.source).add(edge.target);
    neighbors.get(edge.target).add(edge.source);
  }
  const visible = new Set([selected.id]);
  let frontier = [selected.id];
  for (let i = 0; i < depth && visible.size < limit; i++) {
    const next = [];
    for (const u of frontier) {
      for (const v of neighbors.get(u) || []) {
        if (visible.size >= limit) break;
        if (visible.has(v)) continue;
        visible.add(v);
        next.push(v);
      }
      if (visible.size >= limit) break;
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return {
    ok: true, center: selected.name, depth, limit,
    fullNodeCount: graph.nodes.length,
    fullEdgeCount: graph.edges.length,
    nodes: graph.nodes.filter(node => visible.has(node.id)),
    edges: graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target))
  };
}));

app.get("/api/path", route(async (req) => {
  const { from, to } = req.query;
  const algorithm = String(req.query.algorithm || "bfs").toLowerCase();

  if (!from || !to) {
    const error = new Error("Both 'from' and 'to' are required.");
    error.status = 400;
    throw error;
  }

  const command = {
    bfs: "path",
    dijkstra: "dijkstra",
    astar: "astar",
    dial: "dial",
    bellmanford: "bellmanford",
    bidirectional: "bidirectional",
    bidijkstra: "bidijkstra",
    duan2025: "duan2025"
  }[algorithm];

  if (!command) {
    const error = new Error(
      "algorithm must be bfs, dijkstra, astar, dial, bellmanford, bidirectional, bidijkstra, or duan2025."
    );
    error.status = 400;
    throw error;
  }

  return runEngine([command, String(from), String(to)]);
}));

app.get("/api/reachable", route(async (req) => {
  const { from } = req.query;
  if (!from) {
    const error = new Error("'from' is required.");
    error.status = 400;
    throw error;
  }
  return runEngine(["reachable", String(from)]);
}));

app.get("/api/cycles", route(async () => runEngine(["cycles"])));
app.get("/api/scc", route(async () => runEngine(["scc"])));

app.get("/api/search", route(async (req) => {
  const q = String(req.query.q || "").trim();
  if (!q) return { ok: true, dataStructure: "Trie", query: q, matches: [] };
  return runEngine(["search", q]);
}));

app.get("/api/lab/trace", route(async (req) => {
  const algorithm = String(req.query.algorithm || "bfs").toLowerCase();
  if (!["bfs", "dfs", "dijkstra", "tarjan"].includes(algorithm)) {
    const error = new Error("Unsupported trace algorithm"); error.status = 400; throw error;
  }
  if (algorithm !== "tarjan" && (!req.query.from || !req.query.to)) {
    const error = new Error("Trace requires from and to"); error.status = 400; throw error;
  }
  return runEngine(["labtrace", algorithm, String(req.query.from || "_"), String(req.query.to || "_")]);
}));
app.get("/api/lab/compare", route(async (req) => {
  if (!req.query.from || !req.query.to) {
    const error = new Error("Compare requires from and to"); error.status = 400; throw error;
  }
  return runEngine(["labcompare", String(req.query.from), String(req.query.to)]);
}));
app.get("/api/lab/components", route(async () => runEngine(["labcomponents"])));
app.get("/api/lab/kpaths", route(async (req) => {
  if (!req.query.from || !req.query.to) {
    const error = new Error("Routes require from and to"); error.status = 400; throw error;
  }
  const count = Math.max(1, Math.min(8, Number(req.query.k) || 3));
  return runEngine(["labkpaths", String(req.query.from), String(req.query.to), String(Math.trunc(count))]);
}));
app.get("/api/lab/playground", route(async (req) => {
  const { from, to, edgeFrom, edgeTo, reactionId } = req.query;
  if (![from,to,edgeFrom,edgeTo,reactionId].every(v=>v!==undefined)) {
    const error = new Error("Requires from, to and selected edge"); error.status = 400; throw error;
  }
  return runEngine(["labplayground",String(from),String(to),String(edgeFrom),String(edgeTo),String(reactionId)]);
}));
app.get("/api/lab/edit", route(async (req) => {
  const { from, to, mode, edgeFrom, edgeTo, reactionId, weight } = req.query;
  if (![from,to,mode,edgeFrom,edgeTo,reactionId,weight].every(v=>v!==undefined)) {
    const error = new Error("Edit requires mode, endpoints, reaction ID and weight");error.status = 400;throw error;
  }
  if (!["add", "replace"].includes(mode)) {
    const error = new Error("Edit mode must be add or replace");error.status = 400;throw error;
  }
  const w = Number(weight);
  if (!Number.isInteger(w) || w < 1 || w > 1000) {
    const error = new Error("Weight must be a positive integer up to 1000");error.status = 400;throw error;
  }
  return runEngine(["labedit", String(from), String(to), String(mode),
    String(edgeFrom), String(edgeTo), String(reactionId), String(w)]);
}));
app.get("/api/lab/csr", route(async (req) =>
  runEngine(["labcsr", String(Math.max(1, Math.min(2000, Number(req.query.iterations)||250)))])));
app.get("/api/lab/synthetic", route(async (req) =>
  runEngine(["labsynthetic", String(Math.max(2, Math.min(25000, Number(req.query.nodes)||1000))),
    String(Math.max(1, Math.min(250000, Number(req.query.edges)||3000))),
    String(Math.trunc(Number(req.query.seed)||42))])));

// Railway / Docker: serve the Vite production build and API on ONE origin.
const webDist = path.join(repoRoot, "web", "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist, { maxAge: "1h", index: "index.html" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}
app.use((error, req, res, next) => {
  console.error("[ChemPath API]", error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({
    ok: false, error: error.status ? error.message : "Internal server error"
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`ChemPath API listening on http://localhost:${port}`);
  console.log(`C++ engine: ${enginePath}`);
});
