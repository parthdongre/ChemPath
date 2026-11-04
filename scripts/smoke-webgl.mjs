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

  // Real browser optical material: SDF maps, SVG displacement and CSS backdrop.
  const optics=await page.locator(".sigma-toolbar").evaluate(element=>{
    const first=getComputedStyle(element,"::before");
    const mapCount=document.querySelectorAll(
      ".studio-glass-svg-filter feDisplacementMap").length;
    const mode=element.dataset.liquidRefraction;
    return {mode,mapCount,backdrop:first.backdropFilter||first.webkitBackdropFilter,
      prefersReduced:document.querySelector(".studio-app")?.dataset.reduceTransparency};
  });
  assert.ok(optics.mode==="displacement"||optics.mode==="frosted",
    "Glass must declare real refractive or readable fallback mode");
  if(optics.mode==="displacement"){
    assert.ok(optics.mapCount>=3,"Refraction must use RGB displacement maps");
    assert.match(optics.backdrop,/url\(/,
      "Chrome liquid glass must bend its actual backdrop, not only a decorative highlight");
  }
  // Cartographic detail is visualization-only; C++ paths are unaffected.
  const map=page.locator(".cartographic-graph");
  await map.waitFor({state:"visible"});
  assert.equal(await map.getAttribute("data-graph-detail"),"adaptive");
  await page.waitForFunction(()=>
    document.querySelector(".cartographic-graph")?.getAttribute("data-map-stage")==="overview");
  const clusters=page.locator(".sigma-compound-cluster");
  assert.ok(await clusters.count()>0,
    "Map clarity overview must group nearby lower-salience compounds");
  fs.mkdirSync("screenshots",{recursive:true});
  await page.locator(".graph-frame").screenshot({
    path:"screenshots/studio-clusters.png",animations:"disabled"
  });
  const counts=await page.locator(".sigma-footnote").innerText();
  const match=counts.match(/([\d,]+)\/([\d,]+) drawn links/);
  assert.ok(match,"The visible/total graph-edge counts must be disclosed");
  assert.ok(Number(match[1].replaceAll(",",""))<Number(match[2].replaceAll(",","")),
    "Overview must hide secondary edges to prevent a hairball");

  await page.getByRole("button",{name:"All links"}).click();
  assert.equal(await map.getAttribute("data-graph-detail"),"all");
  await page.getByRole("button",{name:"Map clarity"}).click();
  assert.equal(await map.getAttribute("data-graph-detail"),"adaptive");

  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.waitForFunction(()=>
    document.querySelector(".cartographic-graph")?.getAttribute("data-map-stage")==="neighborhood",
    null,{timeout:10000});
  assert.equal(await page.locator(".sigma-compound-cluster").count(),0,
    "Zooming into neighborhood must dissolve overview clusters");
  await page.getByRole("button",{name:"Fit network"}).click();
  await page.waitForFunction(()=>
    document.querySelector(".cartographic-graph")?.getAttribute("data-map-stage")==="overview",
    null,{timeout:10000});

  await page.getByRole("button",{name:"Focus lens"}).click();
  const lens=page.locator('[data-testid="graph-focus-lens"]');
  assert.equal(await lens.count(),1,"An enabled map lens must mount");
  await graph.hover({position:{x:Math.max(40,size.width/2),y:Math.max(40,size.height/2)}});
  await page.waitForFunction(()=>
    document.querySelector('[data-testid="graph-focus-lens"]')?.style.opacity==="1");
  fs.mkdirSync("screenshots",{recursive:true});
  await page.locator(".graph-frame").screenshot({
    path:"screenshots/studio-lens.png",animations:"disabled"
  });
  await page.getByRole("button",{name:"Focus lens"}).click();
  assert.equal(await lens.count(),0,"Disabling the map lens must unmount the overlay");

  await page.getByRole("button",{name:"Reduce transparency effects"}).click();
  assert.equal(await page.locator(".studio-app").getAttribute("data-reduce-transparency"),"true");
  await page.getByRole("button",{name:"Enable transparency effects"}).click();
  assert.equal(await page.locator(".studio-app").getAttribute("data-reduce-transparency"),"false");
  // Prevent glass surfaces from taking document flow space.
  const toolbarBox=await page.locator(".sigma-toolbar").boundingBox();
  const footerBox=await page.locator(".sigma-footnote").boundingBox();
  const graphBox=await graph.boundingBox();
  assert.ok(toolbarBox&&toolbarBox.width<470,
    "Map controls must remain a compact floating toolbar");
  assert.ok(footerBox&&graphBox&&footerBox.y>graphBox.y+graphBox.height-95,
    "Graph status must stay anchored near the canvas bottom");
  // Verify the fallback renderer remains accessible.
  await page.getByRole("button", { name: "Path Layout" }).click();
  await page.locator(".network-canvas").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "GPU Network" }).click();
  await page.locator(".sigma-canvas").waitFor({ state: "visible" });
  // Product shell: keyboard command palette and instant path results.
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", {name:"Command palette"}).waitFor({state:"visible"});
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", {name:"Command palette"}).waitFor({state:"hidden"});
  const sourceTargetBefore=await page.locator(".compound-picker-value").allInnerTexts();
  const expectedApiResult=await page.evaluate(async()=>{
    const response=await fetch("/api/path?from=Methane&to=Bicarbonate&algorithm=bfs");
    return {status:response.status,...await response.json()};
  });
  assert.ok(expectedApiResult.found&&expectedApiResult.reactionPath?.length>0,
    "Backend reference query Methane to Bicarbonate should contain a verified participation path");
  await page.getByRole("button", {name:"Find pathway"}).click();
  await page.locator(".result-dock .run-meta").waitFor({state:"visible",timeout:35000});
  await page.locator(".result-dock .reaction-audit-card").first()
    .waitFor({state:"visible",timeout:4500}).catch(()=>{});
  const routeCards=await page.locator(".result-dock .reaction-audit-card").count();
  if(routeCards===0){
    const details=await page.locator(".result-dock").innerText().catch(()=>"Inspector was unmounted");
    throw new Error("Computed route not shown immediately in inspector. "+
      JSON.stringify({details,source:await page.locator(".compound-picker-value").allInnerTexts(),
        sourceTargetBefore,apiReference:{status:expectedApiResult.status,
          found:expectedApiResult.found,steps:expectedApiResult.steps},
        consoleErrors:errors}));
  }
  fs.mkdirSync("screenshots", {recursive:true});
  await page.evaluate(()=>{
    document.documentElement.style.scrollBehavior="auto";
    window.scrollTo(0,0);
  });
  await page.waitForTimeout(120);
  await page.screenshot({path:"screenshots/studio-hosted.png",animations:"disabled"});
  await page.locator(".graph-frame").screenshot({path:"screenshots/studio-cartography.png",animations:"disabled"});
  await page.locator('[data-studio-view="compare"]').click();
  await page.locator("#algorithm-lab").waitFor({state:"visible"});
  await page.locator("#algorithm-lab .lab-tabs button").filter({ hasText: "Comparison" }).click();
  await page.getByRole("button", { name: "Compare all 8 algorithms" }).click();
  await page.locator(".lab-compare-row").nth(8).waitFor({ state: "visible", timeout: 35000 });

  // Capture running GPU graph, not a mockup or static rendering.
  await page.locator('[data-studio-view="explore"]').click();
  await page.locator(".sigma-canvas").waitFor({state:"visible",timeout:35000});
  await page.evaluate(() => document.querySelector(".graph-frame").scrollIntoView());
  await page.waitForTimeout(350);
  fs.mkdirSync("screenshots", { recursive: true });
  await page.locator(".graph-frame").screenshot({
    path: "screenshots/webgl-hosted.png", animations: "disabled"
  });

  // Responsive real-Chromium QA on the same running application.
  await page.setViewportSize({width:1920,height:1080});
  await page.waitForTimeout(650); // resize-triggered Sigma route camera fitting
  const routeViewport=await page.locator(".sigma-route-overlay").evaluate(svg=>{
    const path=svg.querySelector(".sigma-route-path");
    const d=path?.getAttribute("d")||"";
    const points=[...d.matchAll(/[ML](-?[0-9.]+) (-?[0-9.]+)/g)]
      .map(m=>({x:Number(m[1]),y:Number(m[2])}));
    const rect=svg.getBoundingClientRect();
    return {width:rect.width,height:rect.height,points};
  });
  assert.ok(routeViewport.points.length>=2,"Actual route should have waypoints");
  for(const point of routeViewport.points){
    assert.ok(point.x>=12&&point.x<=routeViewport.width-12,
      "Route waypoint horizontally clipped by resized graph canvas");
    assert.ok(point.y>=12&&point.y<=routeViewport.height-12,
      "Route waypoint vertically clipped by resized graph canvas");
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:"screenshots/studio-widescreen.png",animations:"disabled"});

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(180);
  const mobileCanvas=await page.locator(".sigma-canvas").boundingBox();
  assert.ok(mobileCanvas?.width>200 && mobileCanvas?.height>300,
    "Mobile graph workspace is clipped or invisible");
  await page.getByRole("button",{name:"Use light appearance"}).click();
  assert.equal(await page.locator(".studio-app").getAttribute("data-theme"),"light");
  await page.getByRole("button",{name:"Use dark appearance"}).click();
  await page.locator('[data-studio-view="data"]').click();
  await page.locator("#data-library").waitFor({state:"visible"});
  await page.locator('[data-studio-view="explore"]').click();
  await page.locator(".sigma-canvas").waitFor({state:"visible"});
  await page.waitForTimeout(200);
  await page.screenshot({path:"screenshots/studio-mobile.png",animations:"disabled"});

  assert.deepEqual(errors, [], "Browser JavaScript errors: " + errors.join("; "));
  console.log(JSON.stringify({
    status: "passed", webgl: rootWebGL, canvasCount, graphSize: size,
    comparisonRows: 8, screenshot: "screenshots/webgl-hosted.png",
    studioScreenshot: "screenshots/studio-hosted.png"
  }));
} finally {
  await browser.close();
}
