#!/usr/bin/env node
/**
 * One-command end-semester release verification.
 *
 * Offline by default. Exercises curated C++ algorithms, production API,
 * synthetic ORD SQLite fixtures, and built frontend. It intentionally DOES
 * NOT download Rhea/ORD corpora or treat graph paths as chemical syntheses.
 *
 * npm run verify:release
 * npm run verify:release -- --report /tmp/chempath-review.json
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: node scripts/verify-release.mjs [--report <output.json>]");
  console.log("Runs offline C++ builds/tests, audits, API integration, and built-web smoke.");
  console.log("Full online Rhea import and complete ORD corpus are not tested by this command.");
  process.exit(0);
}
const at = argv.indexOf("--report");
if ((at >= 0 && (!argv[at + 1] || argv.length !== 2)) || (at < 0 && argv.length)) {
  console.error("Invalid options. Use --help for usage.");
  process.exit(2);
}
const output = at >= 0 ? resolve(argv[at + 1]) : null;
const checks = [
  ["Chemistry data audit", "npm", ["run", "audit:chemistry"]],
  ["C++17 engine build", "npm", ["run", "build:engine"]],
  ["C++ engine, CSR, dependency, Pareto and ORD tests", "npm", ["run", "test:engine"]],
  ["Persistent C++/Node DSA API", process.execPath, ["scripts/smoke-api.mjs"]],
  ["On-demand ORD SQLite integration", process.execPath, ["scripts/test-ord-api.mjs"]],
  ["PubChem CID catalog SQLite integration (offline fixture)", process.execPath, ["scripts/test-pubchem-catalog.mjs"]],
  ["Production React build", "npm", ["run", "build:web"]],
  ["Single-origin production API + frontend", process.execPath, ["scripts/smoke-production.mjs"]],
];
function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot, encoding: "utf8", timeout: 5000
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}
const evidence = {
  project: "ChemPath",
  verification: "offline end-semester release smoke",
  collectedAt: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  revision: gitRevision(),
  dataScope: "curated dataset + locally created synthetic ORD SQLite test fixtures",
  excludedFromThisCheck: [
    "online full Rhea download", "complete real ORD corpus performance",
    "experimental chemical synthesis validation",
    "full online PubChem 500k catalog import (requires npm run data:500k)",
  ],
  checks: [],
  success: false,
};
for (const [name, command, args] of checks) {
  console.log("\n" + "=".repeat(64));
  console.log("CHECK: " + name);
  console.log("RUN: " + command + " " + args.join(" "));
  const start = process.hrtime.bigint();
  const run = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "0" },
    timeout: 180_000,
  });
  const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
  const passed = !run.error && run.status === 0;
  evidence.checks.push({
    name,
    command: [command, ...args],
    success: passed,
    seconds: Number(elapsedSec.toFixed(3)),
    exitCode: run.status,
    error: run.error?.message ?? null,
  });
  console.log("RESULT: " + (passed ? "PASS" : "FAIL") +
              " (" + elapsedSec.toFixed(2) + " seconds)");
  if (!passed) break;
}
evidence.success = evidence.checks.length === checks.length &&
                   evidence.checks.every(check => check.success);
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log("\nVerification report: " + output);
}
console.log("\n" + "-".repeat(64));
for (const check of evidence.checks) {
  console.log((check.success ? "PASS" : "FAIL") +
              "  " + check.name + "  (" + check.seconds + "s)");
}
console.log(evidence.success
  ? "\nPASS: all offline ChemPath release checks passed."
  : "\nFAIL: review the first failing check before deploying or presenting.");
process.exit(evidence.success ? 0 : 1);
