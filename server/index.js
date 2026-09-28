import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
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

const dataDir = path.join(repoRoot, "data");
const app = express();

app.use(cors());
app.use(express.json());

async function runEngine(args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(
      enginePath,
      [...args, "--data", dataDir],
      {
        cwd: repoRoot,
        timeout: 10000,
        maxBuffer: 16 * 1024 * 1024
      }
    );

    if (stderr?.trim()) {
      console.warn("[ChemPath engine]", stderr.trim());
    }

    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === "ENOENT") {
      const buildHint = process.platform === "win32"
        ? "Run: cmake -S engine -B engine/build && cmake --build engine/build --config Release"
        : "Run: npm run build:engine";

      const friendlyError = new Error(`C++ engine not found. ${buildHint}`);
      friendlyError.status = 503;
      throw friendlyError;
    }

    const output = error.stdout?.toString?.().trim();
    if (output) {
      try {
        const parsed = JSON.parse(output);
        const engineError = new Error(parsed.error || "C++ engine command failed.");
        engineError.status = 400;
        throw engineError;
      } catch {
        // fall through to the original process error
      }
    }
    throw error;
  }
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

app.get("/api/stats", route(async () => runEngine(["stats"])));
app.get("/api/network", route(async () => runEngine(["network"])));

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

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`ChemPath API listening on http://localhost:${port}`);
  console.log(`C++ engine: ${enginePath}`);
});
