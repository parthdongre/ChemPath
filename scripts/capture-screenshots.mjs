/**
 * Capture screenshots from the actual ChemPath React/Vite + C++ API runtime.
 * These screenshots are NOT mockups. Run by the GitHub Actions screenshot job.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const output = path.resolve("screenshots");
fs.mkdirSync(output, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome"
].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
if (!chromePath) throw new Error("No Chromium or Chrome binary available. Paths: " + chromeCandidates.join(", "));

const browser = await chromium.launch({
  headless: true, executablePath: chromePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
});

const page = await browser.newPage({
  viewport: { width: 1500, height: 980 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce"
});
const errors = [], captures = [];
page.on("pageerror", error => errors.push("PAGEERROR: " + error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push("CONSOLE: " + message.text());
});

async function save(name, target) {
  const file = path.join(output, name + ".png");
  await page.waitForTimeout(900);
  if (target) {
    await target.scrollIntoViewIfNeeded({ timeout: 20000 });
    await target.screenshot({ path: file, animations: "disabled", timeout: 30000 });
  } else {
    await page.screenshot({ path: file, animations: "disabled", timeout: 30000 });
  }
  captures.push({ name, path: path.relative(".", file), bytes: fs.statSync(file).size });
  console.log("SCREENSHOT:", file, fs.statSync(file).size, "bytes");
}

async function step(name, action) {
  try {
    await action();
    console.log("COMPLETE:", name);
  } catch (error) {
    errors.push(name + ": " + error.message);
    console.error("FAILED:", name, error.message);
  }
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator("#explorer").waitFor({ state: "visible", timeout: 35000 });
  await page.locator("#algorithm-lab").waitFor({ state: "attached", timeout: 35000 });
  await page.waitForTimeout(2200);

  await step("home hero", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await save("01-home-hero");
  });

  await step("network explorer", async () => {
    await page.evaluate(() => {
      const target = document.querySelector("#explorer");
      window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 30);
    });
    await save("02-network-explorer");
  });

  const lab = page.locator("#algorithm-lab");
  await step("Dijkstra trace", async () => {
    await lab.getByRole("button", { name: "Generate C++ trace" }).click();
    await lab.locator(".lab-trace-layout").waitFor({ state: "visible", timeout: 30000 });
    for (let i = 0; i < 12; i++) {
      await lab.getByRole("button", { name: "Step forward" }).click();
    }
    await save("03-dijkstra-trace", lab);
  });

  await step("side-by-side comparison", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Comparison" }).click();
    await lab.getByRole("button", { name: "Compare all 8 algorithms" }).click();
    await lab.locator(".lab-compare-row").nth(8).waitFor({ state: "visible", timeout: 25000 });
    await save("04-algorithm-comparison", lab);
  });

  await step("three alternative pathways", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Routes" }).click();
    await lab.getByRole("button", { name: "Find 3 shortest loopless routes" }).click();
    await lab.locator(".lab-paths article").first().waitFor({ state: "visible", timeout: 30000 });
    await save("05-alternative-pathways", lab);
  });

  await step("SCC condensation and DSU", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Components" }).click();
    await lab.getByRole("button", { name: "Build SCC condensation DAG" }).click();
    await lab.locator(".lab-components article").first().waitFor({ state: "visible", timeout: 30000 });
    await save("06-scc-condensation", lab);
  });

  await step("CSR and synthetic benchmarks", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Benchmarks" }).click();
    await lab.getByRole("button", { name: "Benchmark CSR vs adjacency lists" }).click();
    await lab.locator(".lab-metrics .lab-metric").first().waitFor({ state: "visible", timeout: 30000 });
    await lab.getByRole("button", { name: "Generate and run" }).click();
    await page.waitForTimeout(1300);
    await save("07-csr-benchmarks", lab);
  });

  await step("Trie search", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Trie" }).click();
    await lab.getByRole("button", { name: "Search C++ Trie" }).click();
    await lab.locator(".lab-components article").first().waitFor({ state: "visible", timeout: 25000 });
    await save("08-trie-search", lab);
  });

  await step("sandbox editor", async () => {
    await lab.locator(".lab-tabs button").filter({ hasText: "Playground" }).click();
    await lab.locator("select").first().selectOption("add");
    await lab.getByRole("button", { name: "Recompute route" }).click();
    await lab.locator(".lab-route-node").first().waitFor({ state: "visible", timeout: 30000 });
    await save("09-graph-playground", lab);
  });

  // Also capture mobile responsiveness from the real browser.
  await step("mobile lab", async () => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.waitForTimeout(500);
    await save("10-mobile-lab", lab);
  });

} finally {
  fs.writeFileSync(path.join(output, "capture-report.json"), JSON.stringify({
    capturedAt: new Date().toISOString(),
    repository: "parthdongre/ChemPath",
    sourceBranch: "main",
    captures, errors
  }, null, 2));
  console.log("CAPTURES:", captures.length, "ERRORS:", errors.length);
  console.log(JSON.stringify(errors, null, 2));
  await browser.close();
}

if (captures.length < 5) process.exitCode = 1;
