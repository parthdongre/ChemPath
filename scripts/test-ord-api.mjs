// Exercises the SQLite-backed ORD REST surface without downloading gigabytes.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chempath-ord-test-"));
const db = path.join(dir, "ord.sqlite");
const fixture = [
  "import sqlite3, sys",
  "db = sqlite3.connect(sys.argv[1])",
  "db.executescript('''",
  "CREATE TABLE ord_reactions(id INTEGER PRIMARY KEY,ord_id TEXT UNIQUE,reaction_smiles TEXT,source_file TEXT);",
  "CREATE TABLE ord_participants(smiles TEXT,reaction_id INTEGER,role TEXT,PRIMARY KEY(smiles,reaction_id,role)) WITHOUT ROWID;",
  "CREATE TABLE ord_files(source_file TEXT PRIMARY KEY,processed INTEGER,records INTEGER,indexed INTEGER);",
  "''')",
  "db.execute('INSERT INTO ord_reactions VALUES (1,?,?,?)',('ord-example-1','CCO.C>>CCOC','test.parquet'))",
  "db.execute('INSERT INTO ord_reactions VALUES (2,?,?,?)',('ord-example-2','CCO.O>>CC=O','test.parquet'))",
  "db.executemany('INSERT INTO ord_participants VALUES (?,?,?)',[",
  "('CCO',1,'reactant'),('C',1,'reactant'),('CCOC',1,'product'),",
  "('CCO',2,'reactant'),('O',2,'agent'),('CC=O',2,'product')])",
  "db.execute('INSERT INTO ord_files VALUES (?,?,?,?)',('test.parquet',1,2,2))",
  "db.commit()",
  "db.close()"
].join("\n");
const python = spawnSync("python3", ["-c", fixture, db], { encoding: "utf8" });
assert.equal(python.status, 0, python.stderr);
const port = 9981;
const server = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, PORT: String(port), CHEMPATH_ORD_DB: db },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
server.stdout.on("data", b => { logs += String(b); });
server.stderr.on("data", b => { logs += String(b); });
const base = "http://127.0.0.1:" + port;
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function get(uri, status=200) {
  const response = await fetch(base + uri);
  const payload = await response.json();
  assert.equal(response.status, status, uri + " " + JSON.stringify(payload));
  return payload;
}
try {
  let ready = false;
  for (let i=0;i<60;i++) {
    try { const h = await get("/api/health"); ready=h.ok; if(ready)break; }
    catch { await sleep(250); }
  }
  assert.ok(ready, "Server failed: " + logs);
  const stats = await get("/api/ord/status");
  assert.equal(stats.available, true);
  assert.equal(stats.reactions, 2);
  assert.equal(stats.withReactionSmiles, 2);
  const search = await get("/api/ord/search?q=CCO");
  assert.equal(search.matches.length, 2);
  const byId = await get("/api/ord/search?q=ord-example");
  assert.equal(byId.matches.length, 2);
  const detail = await get("/api/ord/reaction/1");
  assert.equal(detail.reaction.ordId, "ord-example-1");
  assert.ok(detail.participants.some(p=>p.role === "reactant" && p.smiles === "CCO"));
  const hood = await get("/api/ord/neighborhood?smiles=CCO");
  assert.equal(hood.reactions, 2);
  assert.ok(hood.nodes.some(n=>n.id === "rxn:1"));
  assert.ok(hood.nodes.some(n=>n.id === "mol:CCO"));
  assert.equal(hood.edges.filter(e=>e.source === "mol:CCO").length, 2);
  await get("/api/ord/reaction/999", 404);
  await get("/api/ord/search?q=x", 400);
  await get("/api/ord/neighborhood?smiles=CCO&limit=999", 400);
  console.log("ORD SQLite API integration passed: stats, search, details, bipartite graph, validation.");
} finally {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
}
