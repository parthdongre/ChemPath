# ChemPath Studio — Cartographic Graph and Adaptive Glass

## Visual reference and boundaries

The Apple Maps reference illustrates layered roads, selected routes, sparse
high-priority labels, zoom-based detail and floating glass controls. We adopt
those **cartographic principles**, not geographic data or platform-private
Liquid Glass code.

References:
- https://developer.apple.com/design/human-interface-guidelines/maps/
- https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass
- https://developer.apple.com/videos/play/wwdc2025/219/
- https://v3.sigmajs.org/docs/advanced/customization/

The reaction network is **not geographical**. Visual simplification never proves
a compound has no outgoing reaction. The C++ engine and underlying Graphology
network are never pruned by cartographic rendering.

## Implemented on the product-overhaul branch

- Three progressive visual levels: overview prioritizes prominent edges and
  compounds; zoom reveals neighborhood links; detail reveals every edge.
  The explicit **All links** control overrides all filtering.
- Degree-ranked compound labels and edge tiers. Connectivity is a graphical
  importance proxy, NOT chemistry plausibility or yield.
- Map-like route casing with source and target markers; the C++ path itself is
  neither modified nor inferred from the display.
- A bounded local neighborhood remains visible around highlighted routes.
- New compound selections recenter the camera without breaking initial overview.
- Optional pointer-controlled **Lens** magnifies live graph coordinates.
- Small floating controls respond to pointer position through specular lighting,
  translucency and optional SVG-filter rim distortion.
- Accessibility: reduced motion, high contrast, reduced transparency and a
  persistent Reduce transparency toggle; no dependency on these effects.
- Unit tests for LOD, index determinism and route survival; real Chromium
  browser tests plus screenshots.

Primary files:
- web/src/components/graphCartography.js
- web/src/components/SigmaNetwork.jsx
- web/src/components/GraphLens.jsx
- web/src/components/RouteOverlay.jsx
- web/src/components/StudioGlassEffects.jsx
- web/src/studio-cartography.css
- scripts/test-graph-cartography.mjs
- scripts/smoke-webgl.mjs

## More improvements worth implementing

### P0 — Needed for release-grade reliability

1. **Compound clusters and robust label collision avoidance.** Screen-space
   decluttering, not just top-degree ranking; uncluster selected nodes.
2. **Directionality and multi-reactant logic.** Explain arrows, AND
   dependencies, participation versus feasible chemistry, and confidence.
3. **Stable layout cache.** Preserve geography between searches and dataset
   transitions; avoid expensive relayout when only route selection changes.
4. **Performance instrumentation.** Measure actual FPS, p95 interaction
   latency, first graph paint, memory and WebGL recovery on Macs and Windows;
   don't assert performance numbers from intuition.
5. **Incomplete searches and failures.** Explicit result semantics for
   confirmed unreachable, truncated by limits, unknown chemical requirements,
   missing datasets and engine disconnected.
6. **Chromium, Safari and Firefox QA.** Optical distortion of backdrops is not
   universally supported. Test fallback and controls on all three.

### P1 — Product feel

7. Persistent camera, selection and source-target history across workspaces.
8. Search-driven center-and-zoom, compact compound previews, keyboard navigation.
9. Step-through route navigation with verified edge metadata and timestamps.
10. Export PNG/SVG reports with provenance, selected dataset and disclaimers.
11. Data Library sources with actual local index/import status, not implied online status.
12. A debugger-grade Laboratory timeline with keyboard-accessible replay.

### P2 — Evaluate only if useful

13. Edge bundling and smoother route geometry, without visually suggesting
    connections that the reaction graph does not contain.
14. ForceAtlas2 in a Worker and incremental large-subgraph tiling.
15. Mobile bottom-sheet inspector and touch-optimized hit targets.
16. Constraint overlays, known reagents and catalysts, provenance and Pareto.
17. Progressive Web App offline recovery and browser crash-resilience.
18. Real GPU refraction only if browser support, accessibility and
    performance measurements justify it.

## Testing and honesty

Install and run as normal:

    npm install
    npm run build:engine
    npm run dev

Cartographic tests:

    node --test scripts/test-graph-cartography.mjs

The WebGL CI job captures actual Chromium screenshots at:
- screenshots/studio-cartography.png
- screenshots/studio-lens.png
- screenshots/studio-hosted.png

The optical map lens uses the actual Graphology coordinates, not Apple
MapKit. Our web material approximates pointer-responsive specular lighting.
It is not native Liquid Glass and does not promise identical refraction on
Safari, Chromium and Firefox. It does not alter any chemical data.
