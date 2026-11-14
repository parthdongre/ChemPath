import cors from "cors";
import express from "express";
import { ordStatus, ordSearch, ordReaction, ordNeighborhood } from "./ord-db.js";
import { catalogStatus, catalogSearch, catalogCompound } from "./compound-catalog.js";
import { createEnginePool } from "./engine-pool.js";
import { text, integer, clamped, oneOf, badRequest } from "./validate.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const engineCandidates =
  process.platform === "win32"
    ? [
        path.join(repoRoot, "engine", "build", "Release", "chempath.exe"),
        path.join(repoRoot, "engine", "build", "chempath.exe")
      ]
    : [path.join(repoRoot, "engine", "build", "chempath")];

const enginePath =
  engineCandidates.find(candidate => fs.existsSync(candidate)) ?? engineCandidates[0];

const dataDir = process.env.CHEMPATH_DATA_DIR
  ? path.resolve(process.env.CHEMPATH_DATA_DIR)
  : path.join(repoRoot, "data");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
// Production serves the UI from the same origin, so CORS is off unless
// CORS_ORIGIN lists allowed origins (comma-separated) for a split deployment.
// Development allows any origin so Vite on :5173 can reach the API on :8787.
const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
if (corsOrigins.length) app.use(cors({ origin: corsOrigins }));
else if (process.env.NODE_ENV !== "production") app.use(cors());
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
const RATE_MAX_TRACKED = 20_000;
function evictRateEntries(now) {
  for (const [key, item] of ipRequests) if (now >= item.until) ipRequests.delete(key);
  // Still full: drop the oldest-inserted entries instead of resetting everyone.
  for (const key of ipRequests.keys()) {
    if (ipRequests.size <= RATE_MAX_TRACKED * 0.9) break;
    ipRequests.delete(key);
  }
}
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/live") return next();
  const now = Date.now();
  if (ipRequests.size >= RATE_MAX_TRACKED) evictRateEntries(now);
  const key = req.ip || "unknown";
  const previous = ipRequests.get(key);
  const item =
    !previous || now >= previous.until ? { count: 0, until: now + RATE_WINDOW_MS } : previous;
  item.count += 1;
  ipRequests.set(key, item);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT);
  if (item.count > RATE_LIMIT) {
    res.setHeader("Retry-After", Math.ceil((item.until - now) / 1000));
    return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
  }
  next();
});

// Pool of persistent C++ workers: each loads the graph once. Engine commands
// only read the graph, so workers are interchangeable.
const engine = createEnginePool({
  enginePath,
  dataDir,
  cwd: repoRoot,
  size: Math.max(1, Math.min(8, Number(process.env.CHEMPATH_ENGINE_WORKERS) || 2))
});
const runEngine = args => engine.run(args);

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

// Liveness: the Node process is up. Does not touch the engine, so a busy
// engine queue cannot make a container look dead.
app.get("/api/live", (req, res) => res.json({ ok: true }));

// Readiness: the C++ engine loaded the dataset and answers commands.
app.get(
  "/api/health",
  route(async () => {
    const stats = await runEngine(["stats"]);
    return {
      ok: true,
      service: "ChemPath API",
      engine: "C++17",
      ...stats
    };
  })
);

// PubChem structures are a separate disk-backed registry, not a C++ edge graph.
app.get(
  "/api/catalog/status",
  route(async () => catalogStatus())
);
app.get(
  "/api/catalog/search",
  route(async req => catalogSearch(req.query.q, req.query.limit, req.query.after))
);
app.get(
  "/api/catalog/compound/:cid",
  route(async req => catalogCompound(req.params.cid))
);

app.get(
  "/api/ord/status",
  route(async () => ordStatus())
);
app.get(
  "/api/ord/search",
  route(async req => ordSearch(req.query.q, req.query.limit))
);
app.get(
  "/api/ord/reaction/:id",
  route(async req => ordReaction(req.params.id))
);
app.get(
  "/api/ord/neighborhood",
  route(async req => ordNeighborhood(req.query.smiles, req.query.limit))
);

// Exact indexed traversal lives in C++, NOT the Node neighborhood renderer.
// A limited unsuccessful search is never claimed globally unreachable.
app.get(
  "/api/ord/path",
  route(async req => {
    if (!ordStatus().available) {
      const e = new Error("ORD database not installed; import/index it first");
      e.status = 503;
      throw e;
    }
    const from = req.query.from,
      to = req.query.to;
    const safe = v =>
      typeof v === "string" && v.length > 0 && v.length <= 512 && !/[\x00-\x1f]/.test(v);
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
    return runEngine([
      "ordpath",
      from,
      to,
      String(maxExpanded),
      String(maxVisited),
      String(maxNeighbors),
      String(cacheMB)
    ]);
  })
);

// The AND-dependency model is separate from ordinary participation paths.
app.get(
  "/api/feasible",
  route(async req => {
    const available = req.query.available;
    const target = req.query.target;
    if (
      typeof available !== "string" ||
      !available.trim() ||
      available.length > 2000 ||
      typeof target !== "string" ||
      !target.trim() ||
      target.length > 180
    ) {
      const error = new Error("Expected available (semicolon-separated) and target compound names");
      error.status = 400;
      throw error;
    }
    return runEngine(["feasible", available, target]);
  })
);

// Constraints run entirely inside the C++ graph engine; the API only validates.
app.post(
  "/api/path/constrained",
  route(async req => {
    const q = req.body ?? {};
    const name = v =>
      typeof v === "string" && v.length >= 1 && v.length <= 180 && !/[\t\r\n]/.test(v);
    const ids = v =>
      Array.isArray(v) && v.length <= 100 && v.every(n => Number.isSafeInteger(n) && n >= 0);
    const tags = v =>
      Array.isArray(v) &&
      v.length <= 30 &&
      v.every(
        x => typeof x === "string" && x.length > 0 && x.length <= 100 && !/[\t\r\n;]/.test(x)
      );
    const count = q.k ?? 3;
    if (
      !name(q.source) ||
      !name(q.target) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 5 ||
      !ids(q.blockedReactionIds ?? []) ||
      !ids(q.blockedCompoundIds ?? []) ||
      !tags(q.availableReagents ?? []) ||
      !tags(q.availableCatalysts ?? []) ||
      !["allow", "strict"].includes(q.unknownRequirements ?? "allow")
    ) {
      const e = new Error("Invalid constrained search parameters");
      e.status = 400;
      throw e;
    }
    return runEngine([
      "constrained",
      q.source,
      q.target,
      String(count),
      (q.blockedReactionIds ?? []).join(","),
      (q.blockedCompoundIds ?? []).join(","),
      (q.availableReagents ?? []).join(";"),
      (q.availableCatalysts ?? []).join(";"),
      q.unknownRequirements ?? "allow"
    ]);
  })
);

app.get(
  "/api/path/pareto",
  route(async req => {
    const { from, to } = req.query;
    const objective = req.query.objective ?? "steps-cost";
    const maxLabels = req.query.maxLabels == null ? 50000 : Number(req.query.maxLabels);
    const maxRoutes = req.query.maxRoutes == null ? 10 : Number(req.query.maxRoutes);
    if (
      typeof from !== "string" ||
      !from ||
      from.length > 180 ||
      typeof to !== "string" ||
      !to ||
      to.length > 180 ||
      /[\t\r\n]/.test(from + to) ||
      !["steps-cost", "steps-cost-reagents"].includes(objective) ||
      !Number.isInteger(maxLabels) ||
      maxLabels < 1 ||
      maxLabels > 100000 ||
      !Number.isInteger(maxRoutes) ||
      maxRoutes < 1 ||
      maxRoutes > 20
    ) {
      const e = new Error("Invalid Pareto search parameters");
      e.status = 400;
      throw e;
    }
    return runEngine(["pareto", from, to, objective, String(maxLabels), String(maxRoutes)]);
  })
);

app.get(
  "/api/stats",
  route(async () => runEngine(["stats"]))
);
app.get(
  "/api/network",
  route(async () => (await readCachedGraph()).graph)
);

// Query-driven subgraph for the WebGL explorer: do not transfer every edge
// again for a neighborhood expansion. Cached snapshot is shared across users.
let graphCachePromise = null;
// The network snapshot and its undirected adjacency are built once and
// shared by every neighborhood request.
function readCachedGraph() {
  if (!graphCachePromise) {
    graphCachePromise = runEngine(["network"])
      .then(graph => {
        const neighbors = new Map();
        const byName = new Map();
        const byId = new Map();
        for (const node of graph.nodes) {
          byId.set(String(node.id), node);
          const key = node.name.toLowerCase();
          if (!byName.has(key)) byName.set(key, node);
        }
        for (const edge of graph.edges) {
          if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set());
          if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set());
          neighbors.get(edge.source).add(edge.target);
          neighbors.get(edge.target).add(edge.source);
        }
        return { graph, neighbors, byName, byId };
      })
      .catch(error => {
        graphCachePromise = null;
        throw error;
      });
  }
  return graphCachePromise;
}
app.get(
  "/api/graph/neighborhood",
  route(async req => {
    const center = String(req.query.center || "")
      .trim()
      .slice(0, 180);
    const depth = Number(req.query.depth ?? 1);
    const limit = Number(req.query.limit ?? 320);
    if (
      !center ||
      !Number.isInteger(depth) ||
      depth < 1 ||
      depth > 3 ||
      !Number.isInteger(limit) ||
      limit < 2 ||
      limit > 1200
    ) {
      throw badRequest("Provide center, depth 1-3, limit 2-1200");
    }
    const { graph, neighbors, byName, byId } = await readCachedGraph();
    const selected = byName.get(center.toLowerCase()) ?? byId.get(center);
    if (!selected) throw badRequest("Compound not found", 404);
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
      ok: true,
      center: selected.name,
      depth,
      limit,
      fullNodeCount: graph.nodes.length,
      fullEdgeCount: graph.edges.length,
      nodes: graph.nodes.filter(node => visible.has(node.id)),
      edges: graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target))
    };
  })
);

const PATH_COMMANDS = {
  bfs: "path",
  dijkstra: "dijkstra",
  astar: "astar",
  dial: "dial",
  bellmanford: "bellmanford",
  bidirectional: "bidirectional",
  bidijkstra: "bidijkstra",
  duan2025: "duan2025"
};

app.get(
  "/api/path",
  route(async req => {
    const from = text(req.query.from, "from");
    const to = text(req.query.to, "to");
    const algorithm = oneOf(req.query.algorithm, "algorithm", Object.keys(PATH_COMMANDS), "bfs");
    return runEngine([PATH_COMMANDS[algorithm], from, to]);
  })
);

app.get(
  "/api/reachable",
  route(async req => runEngine(["reachable", text(req.query.from, "from")]))
);

app.get(
  "/api/cycles",
  route(async () => runEngine(["cycles"]))
);
app.get(
  "/api/scc",
  route(async () => runEngine(["scc"]))
);

app.get(
  "/api/search",
  route(async req => {
    const q = text(req.query.q, "q", { optional: true, fallback: "" });
    if (!q) return { ok: true, dataStructure: "Trie", query: q, matches: [] };
    return runEngine(["search", q]);
  })
);

app.get(
  "/api/lab/trace",
  route(async req => {
    const algorithm = oneOf(
      req.query.algorithm,
      "algorithm",
      ["bfs", "dfs", "dijkstra", "tarjan"],
      "bfs"
    );
    const needsEnds = algorithm !== "tarjan";
    const from = text(req.query.from, "from", { optional: !needsEnds, fallback: "_" });
    const to = text(req.query.to, "to", { optional: !needsEnds, fallback: "_" });
    return runEngine(["labtrace", algorithm, from, to]);
  })
);
app.get(
  "/api/lab/compare",
  route(async req =>
    runEngine(["labcompare", text(req.query.from, "from"), text(req.query.to, "to")])
  )
);
app.get(
  "/api/lab/components",
  route(async () => runEngine(["labcomponents"]))
);
app.get(
  "/api/lab/kpaths",
  route(async req => {
    const from = text(req.query.from, "from");
    const to = text(req.query.to, "to");
    const k = clamped(req.query.k, 3, 1, 8);
    return runEngine(["labkpaths", from, to, String(k)]);
  })
);

// Hypothetical edge parameters shared by the playground and edit sandbox.
// Sandbox reactions use negative IDs (e.g. -2), so reactionId may be < 0.
function edgeParams(q) {
  return {
    from: text(q.from, "from"),
    to: text(q.to, "to"),
    edgeFrom: integer(q.edgeFrom, "edgeFrom", { min: 0, max: 1e9 }),
    edgeTo: integer(q.edgeTo, "edgeTo", { min: 0, max: 1e9 }),
    reactionId: integer(q.reactionId, "reactionId", { min: -1e9, max: 1e9 })
  };
}
app.get(
  "/api/lab/playground",
  route(async req => {
    const p = edgeParams(req.query);
    return runEngine(["labplayground", p.from, p.to, p.edgeFrom, p.edgeTo, p.reactionId]);
  })
);
app.get(
  "/api/lab/edit",
  route(async req => {
    const p = edgeParams(req.query);
    const mode = oneOf(req.query.mode, "mode", ["add", "replace"]);
    const weight = integer(req.query.weight, "weight", { min: 1, max: 1000 });
    return runEngine(["labedit", p.from, p.to, mode, p.edgeFrom, p.edgeTo, p.reactionId, weight]);
  })
);
app.get(
  "/api/lab/csr",
  route(async req => runEngine(["labcsr", clamped(req.query.iterations, 250, 1, 2000)]))
);
app.get(
  "/api/lab/synthetic",
  route(async req =>
    runEngine([
      "labsynthetic",
      clamped(req.query.nodes, 1000, 2, 25000),
      clamped(req.query.edges, 3000, 1, 250000),
      clamped(req.query.seed, 42, -2147483648, 2147483647)
    ])
  )
);

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
    ok: false,
    error: error.status ? error.message : "Internal server error"
  });
});

const port = Number(process.env.PORT || 8787);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`ChemPath API listening on http://localhost:${port}`);
  console.log(`C++ engine: ${enginePath} (${engine.size} workers)`);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    server.close();
    engine.close();
    process.exit(0);
  });
}
