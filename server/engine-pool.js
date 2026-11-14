// Pool of persistent C++ engine workers. Each worker loads the graph once,
// then answers one tab-separated command line with one JSON line.
//
// Jobs wait in one shared queue and each worker runs one job at a time, so a
// slow request occupies only its own worker. A timeout restarts that worker
// and fails only the job it was running.
import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function createEnginePool({
  enginePath,
  dataDir,
  cwd,
  size = 2,
  maxQueue = 32,
  timeoutMs = 30_000,
  log = console
}) {
  const workers = [];
  const queue = [];

  function spawnWorker(slot) {
    const child = spawn(enginePath, ["serve", "--data", dataDir], {
      cwd, stdio: ["pipe", "pipe", "pipe"]
    });
    const worker = { slot, child, job: null, alive: true };
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const job = worker.job;
      if (!job) return;
      worker.job = null;
      clearTimeout(job.timer);
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        job.reject(new Error("Invalid engine response"));
        return dispatch();
      }
      if (payload.ok === false) {
        job.reject(httpError(payload.error || "Engine command failed", 400));
      } else {
        job.resolve(payload);
      }
      dispatch();
    });
    child.stderr.on("data", (chunk) => log.warn("[ChemPath engine]", String(chunk)));
    const stop = (cause) => {
      if (!worker.alive) return;
      worker.alive = false;
      if (workers[slot] === worker) workers[slot] = null;
      if (worker.job) {
        clearTimeout(worker.job.timer);
        worker.job.reject(new Error("C++ engine stopped: " + cause));
        worker.job = null;
      }
      dispatch();
    };
    child.on("error", (err) => stop(err.message));
    child.on("exit", (code) => stop("exit code " + code));
    child.stdin.on("error", (err) => stop(err.message));
    workers[slot] = worker;
    return worker;
  }

  function idleWorker() {
    for (let slot = 0; slot < size; slot++) {
      const worker = workers[slot] ?? spawnWorker(slot);
      if (!worker.job) return worker;
    }
    return null;
  }

  function dispatch() {
    while (queue.length) {
      const worker = idleWorker();
      if (!worker) return;
      const job = queue.shift();
      worker.job = job;
      job.timer = setTimeout(() => {
        if (worker.job !== job) return;
        worker.job = null;
        job.reject(httpError("Engine request timed out; worker restarted", 504));
        worker.alive = false;
        if (workers[worker.slot] === worker) workers[worker.slot] = null;
        worker.child.kill();
        dispatch();
      }, timeoutMs);
      worker.child.stdin.write(job.line);
    }
  }

  function run(args = []) {
    if (args.some((part) => /[\t\r\n]/.test(String(part)))) {
      return Promise.reject(httpError("Invalid control characters in request", 400));
    }
    if (!fs.existsSync(enginePath)) {
      return Promise.reject(httpError("C++ engine not found. Run: npm run build:engine", 503));
    }
    if (queue.length >= maxQueue) {
      return Promise.reject(httpError("Engine is busy. Please retry.", 429));
    }
    return new Promise((resolve, reject) => {
      queue.push({ line: args.map(String).join("\t") + "\n", resolve, reject, timer: null });
      dispatch();
    });
  }

  function close() {
    for (const worker of workers) worker?.child.kill();
  }

  return { run, close, size };
}
