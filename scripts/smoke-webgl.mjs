import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const executable = [
  process.env.CHROME_PATH, "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable", "/usr/bin/chromium"
].find(p => p && fs.existsSync(p));
if (!executable) throw new Error("Chrome/Chromium not installed on runner");
const url = process.env.TEST_APP_URL || "http://127.0.0.1:8080";
const browser = await chromium.launch({
  executablePath: executable, headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1
});
const errors = [];
page.on("pageerror", err => errors.push(err.message));
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const graph = page.locator(".sigma-canvas");
  await graph.waitFor({ state: "visible", timeout: 35000 });
  await page.locator(".graph-loading").waitFor({ state: "hidden", timeout: 35000 });
  await page.waitForTimeout(1100);
  const canvasCount = await graph.locator("canvas").count();
  const size = await graph.boundingBox();
  assert.ok(canvasCount >= 1, "Sigma must mount canvas layers");
  assert.ok(size && size.width > 500 && size.height > 300, "GPU graph viewport too small");
  const label = await graph.getAttribute("aria-label");
  assert.match(label, /\d+ compounds/);
  const rootWebGL = await graph.evaluate(element =>
    [...element.querySelectorAll("canvas")].some(canvas => {
      try { return !!(canvas.getContext("webgl2") || canvas.getContext("webgl")); }
      catch { return false; }
    })
  );
  assert.ok(rootWebGL, "No usable browser WebGL canvas");

  // Verify the fallback renderer remains accessible.
  await page.getByRole("button", { name: "Path Layout" }).click();
  await page.locator(".network-canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "GPU Network" }).click();
  await page.locator(".sigma-canvas").waitFor({ state: "visible" });
  await page.locator("#algorithm-lab").scrollIntoViewIfNeeded();
  await page.locator("#algorithm-lab .lab-tabs button").filter({ hasText: "Comparison" }).click();
  await page.getByRole("button", { name: "Compare all 8 algorithms" }).click();
  await page.locator(".lab-compare-row").nth(8).waitFor({ state: "visible", timeout: 35000 });

  // Capture running GPU graph, not a mockup or static rendering.
  await page.evaluate(() => document.querySelector(".graph-frame").scrollIntoView());
  await page.waitForTimeout(350);
  fs.mkdirSync("screenshots", { recursive: true });
  await page.locator(".graph-frame").screenshot({
    path: "screenshots/webgl-hosted.png", animations: "disabled"
  });
  assert.deepEqual(errors, [], "Browser JavaScript errors: " + errors.join("; "));
  console.log(JSON.stringify({
    status: "passed", webgl: rootWebGL, canvasCount, graphSize: size,
    comparisonRows: 8, screenshot: "screenshots/webgl-hosted.png"
  }));
} finally {
  await browser.close();
}
