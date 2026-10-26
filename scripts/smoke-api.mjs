// End-to-end API smoke test, including persistent C++ worker protocol.
// Run after npm run build:engine and npm install.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 9987;
const server = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, PORT: String(port), CHEMPATH_DATA_DIR: "data" },
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
server.stdout.on("data", b => { log += String(b); });
server.stderr.on("data", b => { log += String(b); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const base = "http://127.0.0.1:" + port;
async function get(path, expectedStatus = 200) {
  const response = await fetch(base + path);
  assert.equal(response.status, expectedStatus, path + ": " + response.status);
  return response.json();
}
try {
  let ready = false;
  for (let i = 0; i < 80; ++i) {
    try {
      const health = await get("/api/health");
      if (health.compounds >= 650) { ready = true; break; }
    } catch { await sleep(250); }
  }
  assert.ok(ready, "API never became healthy. Logs: " + log);
  const [stats, network, trace, comparison, components, csr, synthetic, paths] = await Promise.all([
    get("/api/stats"),
    get("/api/network"),
    get("/api/lab/trace?algorithm=dijkstra&from=Methane&to=Bicarbonate"),
    get("/api/lab/compare?from=Methane&to=Bicarbonate"),
    get("/api/lab/components"),
    get("/api/lab/csr?iterations=5"),
    get("/api/lab/synthetic?nodes=250&edges=1000&seed=42"),
    get("/api/lab/kpaths?from=Methane&to=Bicarbonate&k=3")
  ]);
  assert.ok(stats.directedEdges >= 2800);
  assert.ok(network.nodes.length >= 650);
  assert.ok(trace.events.length > 5);
  assert.equal(trace.route.found, true);
  assert.equal(comparison.algorithms.length, 8);
  assert.equal(components.topological.length, components.components.length);
  assert.ok(csr.csrBytes > 0);
  assert.equal(synthetic.reachable, 250);
  assert.ok(paths.routes.length >= 1);
  const first = paths.routes[0];
  const edit = await get("/api/lab/playground?from=Methane&to=Bicarbonate&edgeFrom=" +
    first.path[0].id + "&edgeTo=" + first.path[1].id +
    "&reactionId=" + first.reactionPath[0].reactionId);
  assert.ok(edit.ok);
  const add = await get("/api/lab/edit?from=Methane&to=Bicarbonate&mode=add&edgeFrom=" +
    first.path[0].id + "&edgeTo=" + first.path[first.path.length - 1].id +
    "&reactionId=-2&weight=1");
  assert.equal(add.route.found, true);
  assert.equal(add.route.totalCost, 1);
  assert.equal(add.route.reactionPath[0].sourceKey, "SANDBOX");
  await get("/api/lab/edit?from=Methane&to=Bicarbonate&mode=add&edgeFrom=0&edgeTo=1&reactionId=-2&weight=0", 400);
  const bfs = await get("/api/lab/trace?algorithm=bfs&from=Methane&to=Bicarbonate");
  assert.ok(bfs.events.some(e => e.type === "enqueue"));
  const tarjan = await get("/api/lab/trace?algorithm=tarjan");
  assert.ok(tarjan.events.some(e => e.type === "discover"));
  await get("/api/path?from=Methane", 400);
  console.log("Persistent API smoke passed: health, network, traces, comparison, SCC/DSU,");
  console.log("CSR, synthetic, 3 alternative routes, sandbox and proper HTTP errors.");
} finally {
  server.kill();
}
