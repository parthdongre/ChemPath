// Unit tests for the engine worker pool and shared request validation.
// Uses a tiny fake engine so no C++ build is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEnginePool } from "../server/engine-pool.js";
import { text, integer, clamped, oneOf } from "../server/validate.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chempath-pool-"));
const fake = path.join(dir, "fake-engine.mjs");
fs.writeFileSync(
  fake,
  `#!/usr/bin/env node
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", line => {
  const [cmd, arg] = line.split("\\t");
  if (cmd === "sleep") setTimeout(() => console.log(JSON.stringify({ ok: true, slept: Number(arg) })), Number(arg));
  else if (cmd === "fail") console.log(JSON.stringify({ ok: false, error: "nope" }));
  else console.log(JSON.stringify({ ok: true, echo: arg, pid: process.pid }));
});
`
);
fs.chmodSync(fake, 0o755);
const quiet = { warn() {} };

test("workers run requests in parallel", async () => {
  const pool = createEnginePool({ enginePath: fake, dataDir: dir, cwd: dir, size: 2, log: quiet });
  try {
    // Warm both workers so process startup time is not measured.
    const warm = await Promise.all([pool.run(["echo", "a"]), pool.run(["echo", "b"])]);
    assert.notEqual(warm[0].pid, warm[1].pid);
    const started = Date.now();
    await Promise.all([pool.run(["sleep", 400]), pool.run(["sleep", 400])]);
    assert.ok(Date.now() - started < 750, "two jobs should overlap on two workers");
  } finally {
    pool.close();
  }
});

test("a timeout fails only the slow job and the pool recovers", async () => {
  const pool = createEnginePool({
    enginePath: fake,
    dataDir: dir,
    cwd: dir,
    size: 2,
    timeoutMs: 200,
    log: quiet
  });
  try {
    const slow = pool.run(["sleep", 5000]);
    const fast = pool.run(["echo", "hi"]);
    assert.equal((await fast).echo, "hi");
    await assert.rejects(slow, err => err.status === 504);
    assert.equal((await pool.run(["echo", "again"])).echo, "again");
  } finally {
    pool.close();
  }
});

test("engine errors map to 400 and control characters are rejected", async () => {
  const pool = createEnginePool({ enginePath: fake, dataDir: dir, cwd: dir, size: 1, log: quiet });
  try {
    await assert.rejects(pool.run(["fail"]), err => err.status === 400 && err.message === "nope");
    await assert.rejects(pool.run(["echo", "a\tb"]), err => err.status === 400);
  } finally {
    pool.close();
  }
});

test("queue limit returns 429", async () => {
  const pool = createEnginePool({
    enginePath: fake,
    dataDir: dir,
    cwd: dir,
    size: 1,
    maxQueue: 1,
    log: quiet
  });
  try {
    const running = pool.run(["sleep", 100]);
    const queued = pool.run(["echo", "q"]);
    await assert.rejects(pool.run(["echo", "x"]), err => err.status === 429);
    await Promise.all([running, queued]);
  } finally {
    pool.close();
  }
});

test("missing engine binary returns 503", async () => {
  const pool = createEnginePool({
    enginePath: path.join(dir, "missing"),
    dataDir: dir,
    cwd: dir,
    log: quiet
  });
  await assert.rejects(pool.run(["stats"]), err => err.status === 503);
});

test("validators", () => {
  assert.equal(text(" Methane ", "from"), "Methane");
  assert.throws(() => text(undefined, "from"), { status: 400 });
  assert.throws(() => text(["a", "b"], "from"), { status: 400 });
  assert.throws(() => text("x".repeat(181), "from"), { status: 400 });
  assert.throws(() => text("a\u0001", "from"), { status: 400 });
  assert.equal(text(undefined, "from", { optional: true, fallback: "_" }), "_");
  assert.equal(integer("-2", "id", { min: -5, max: 5 }), -2);
  assert.throws(() => integer("1.5", "id", { min: 0, max: 5 }), { status: 400 });
  assert.throws(() => integer("9", "id", { min: 0, max: 5 }), { status: 400 });
  assert.equal(clamped("abc", 250, 1, 2000), 250);
  assert.equal(clamped("99999", 250, 1, 2000), 2000);
  assert.equal(oneOf(undefined, "a", ["bfs", "dfs"], "bfs"), "bfs");
  assert.equal(oneOf("DFS", "a", ["bfs", "dfs"], "bfs"), "dfs");
  assert.throws(() => oneOf("x", "a", ["bfs"], "bfs"), { status: 400 });
});
