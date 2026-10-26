// Production smoke check: tests the single-origin frontend/API and bounded subgraph.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 9993;
const base = "http://127.0.0.1:" + port;
const env = { ...process.env, NODE_ENV: "production", PORT: String(port), CHEMPATH_DATA_DIR: "data" };
const server = spawn(process.execPath, ["server/index.js"], {
  env, stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
server.stdout.on("data", chunk => { log += String(chunk); });
server.stderr.on("data", chunk => { log += String(chunk); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(url) {
  const res = await fetch(base + url);
  const body = await res.json();
  assert.equal(res.status, 200, url + ": " + JSON.stringify(body).slice(0, 150));
  return body;
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const health = await json("/api/health");
      ready = health.compounds >= 690;
      if (ready) break;
    } catch { await sleep(250); }
  }
  assert.ok(ready, "Production backend not healthy: " + log);
  const page = await fetch(base);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/index-/);
  const fallback = await fetch(base + "/dashboard");
  assert.equal(fallback.status, 200);
  assert.match(await fallback.text(), /<div id="root"><\/div>/);
  const network = await json("/api/network");
  assert.ok(network.nodes.length >= 690 && network.edges.length > 2000);
  const hood = await json("/api/graph/neighborhood?center=Methane&depth=2&limit=80");
  assert.ok(hood.nodes.length >= 2);
  assert.ok(hood.nodes.length <= 80);
  assert.equal(hood.center, "Methane");
  const selected = new Set(hood.nodes.map(n => n.id));
  for (const edge of hood.edges) {
    assert.ok(selected.has(edge.source) && selected.has(edge.target));
  }
  const invalid = await fetch(base + "/api/graph/neighborhood?center=Methane&limit=999999");
  assert.equal(invalid.status, 400);
  const missing = await fetch(base + "/api/graph/neighborhood?center=no-such-compound");
  assert.equal(missing.status, 404);
  const apiUnknown = await fetch(base + "/api/non-existent");
  assert.equal(apiUnknown.status, 404);
  console.log("Hosted smoke passed: SPA, deep link, persistent API, graph neighbors and errors");
} finally {
  server.kill("SIGTERM");
}
