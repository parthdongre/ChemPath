# ChemPath Studio — Product UX overhaul

This is the Phase 1–2 implementation of the [approved Studio design brief](../README.md).
The backend, algorithms, datasets, API routes, chemistry provenance and
educational model remain unchanged.

## What changed

The previous landing hero, algorithm section, explorer, full Laboratory,
ORD database, compound directory and result panels shared one continuously
scrolling document. The current UI is a focused application shell:

- **Topbar**: identity, current workspace, command search, engine
  connection status, theme toggle, inspector visibility.
- **Sidebar**: Explore / Compare / Laboratory / Data Library.
- **Explore**: pathway composer, persistent graph workspace,
  contextual right inspector, optional replay. Routes display **as soon
  as the C++ response arrives**, rather than waiting through an animated
  traversal first.
- **Compare and Laboratory**: preserved existing C++ calls and 10 original
  tools, reorganized into **Learn**, **Optimize** and **Experiment**.
- **Data Library**: the original chemistry-centered compound catalog plus
  the actual indexed ORD browser, with no fake dataset counts.

## Concrete frontend architecture

| Source | Responsibility |
|---|---|
| web/src/components/StudioChrome.jsx | Product header, four-view sidebar, command palette and contextual inspector |
| web/src/App.jsx | Existing engine-backed state/query orchestration, view routing, graph workspace and results |
| web/src/studio.css | Scoped graphite/mint design tokens and responsive application layouts |
| web/src/components/SigmaNetwork.jsx | Existing Sigma/WebGL graph, improved route contrast, camera focus, Shift-click target and edge inspector signals |
| web/src/components/LabPanel.jsx | Preserved C++ Lab API tools, grouped into Learn/Optimize/Experiment |
| web/src/components/OrdExplorer.jsx | Unchanged database browsing and indexed C++ shortest-path interaction |
| scripts/smoke-webgl.mjs | Chromium visual and functional tests for rendering, real C++ path results, command palette, Lab navigation, theme and responsive/mobile layout |

The main application orchestration still lives in App.jsx. A deeper
modular extraction into independently tested hooks, route modules and
design primitives is deliberately reserved for the remaining UX phases
instead of destabilizing the working engine/graph release.

## Visual system

- Background #0C1117, panel #131B24, raised #19232E.
- Text #F3F6F8 and muted #9BABB9.
- Accent #5DD6C1; unknown/caution #E9BC78; error #E88B91.
- System UI font, Inter fallback and JetBrains Mono for chemistry codes.
- Modest 10–15px radii, thin borders, functional color.
- Dark and light UI palettes selected in the title bar; local theme
  preference stores only an appearance value.

## Primary interaction paths

### Find a path

1. Open **Explore** (the default route).
2. Select a **Start** and **Target** compound, or Shift-click a graph node
   to choose a target.
3. Click **Find pathway**.
4. The actual result is immediately rendered in the graph and inspector.
5. Inspect each route step, reaction record, metadata and illustrative
   graph weight. Click **Replay traversal** only when desired.

The route is a **compound-participation path**, not a verified synthesis
procedure. Multi-reactant feasibility has its own C++ dependency model.

### Quick search

Use **⌘K** on macOS, **Ctrl+K** on other platforms, or press **/**
outside a form. The palette offers navigation and compound search, with
**Set start** and **Set target** actions. **Esc** dismisses it.

### Graph exploration

- Click a node to inspect and set the starting compound.
- Shift-click a node to change target.
- Double-click a node to focus the camera.
- Click an edge for reaction metadata in the inspector.
- Use fit/zoom buttons and the optional **Path Layout** renderer.
- Use **Explore neighborhood** for a bounded, indexed subgraph,
  then **Full graph** to restore the normal visualization.

### Algorithm Laboratory

Choose among **Learn**, **Optimize**, **Experiment**. The complete
set of existing engine actions remains available, but the display
reveals fewer unrelated controls at once.

## Tested viewports and evidence

The Chromium test in CI checks:

- Functional WebGL canvas and fallback Cytoscape renderer.
- Command palette opening/closing with Ctrl+K and Esc.
- Instant route result and populated inspector.
- Four-workspace navigation and eight-algorithm comparison.
- Light/dark theme switch.
- Mobile canvas and data-library navigation.
- Screenshots at 1440×1000, 1920×1080 and 390×844.

The workflow publishes **chempath-sigma-ui** with four PNG screenshots
representing the running app.

## Next phases (not yet claimed complete)

- Phase 3: fully unified algorithm replay/debugger and consistent
  explanations across all Laboratory panels.
- Phase 4: deeper data-source management and polished ORD import states.
- Phase 5: broader accessibility review, perf profiling, comprehensive
  UI regression suite, tablet/table-specific layouts, and error-recovery
  work beyond the existing browser smoke tests.

Avoid marketing promises of end-to-end full ORD graph synthesis. This
project remains a technically rigorous educational graph tool.
