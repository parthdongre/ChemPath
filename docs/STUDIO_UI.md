# ChemPath Studio — Product UX overhaul

This is the Phase 1–2 implementation of the [approved Studio design brief](../README.md).
The backend, algorithms, datasets, API routes, chemistry provenance and
educational model remain unchanged.

## What changed

The previous landing hero, algorithm section, explorer, full Laboratory,
ORD database, compound directory and result panels shared one continuously
scrolling document. The current UI is a focused application shell:

- **Topbar**: identity, the four workspaces as tabs (Explore / Compare /
  Laboratory / Data), command search, engine status, theme toggle and
  inspector visibility. There is no sidebar.
- **Explore**: a single query bar above a full-height graph, with a
  contextual right inspector and optional replay. Routes display **as soon
  as the C++ response arrives** and read as a vertical timeline of
  compounds (stops) and reactions (legs).
- **Compare**: the Optimize tools (comparison, routes, constraints, Pareto).
- **Laboratory**: the Learn and Experiment tools (traces, components,
  dependencies, Trie, benchmarks, playground).
- **Data**: dataset totals, the curated compound table, the PubChem
  structure catalog and the indexed ORD browser.

## Concrete frontend architecture

| Source | Responsibility |
|---|---|
| web/src/components/StudioChrome.jsx | Topbar with workspace tabs, command palette and contextual inspector |
| web/src/App.jsx | Existing engine-backed state/query orchestration, view routing, graph workspace and results |
| web/src/index.css | Tailwind CSS v4 entry and the shadcn/ui theme tokens (dark and light) |
| web/components.json | shadcn/ui config (radix-nova style, JSX) with the `@componentry` registry |
| web/src/components/ui/ | shadcn/ui primitives plus Componentry `split-flap-display` and `annotated-text` |
| web/src/components/studio/primitives.jsx | App-level building blocks (map panels, stat strips, section headers, tooltips) |
| web/src/theme.js | Graph colours for WebGL/canvas renderers and chemical formula formatting |
| web/src/components/Formula.jsx | Formulas with real subscripts and charges (HCO₃⁻); SMILES shown verbatim |
| web/src/components/SigmaNetwork.jsx | Existing Sigma/WebGL graph, improved route contrast, camera focus, Shift-click target and edge inspector signals |
| web/src/components/LabPanel.jsx | Preserved C++ Lab API tools, grouped into Learn/Optimize/Experiment |
| web/src/components/OrdExplorer.jsx | Unchanged database browsing and indexed C++ shortest-path interaction |
| scripts/smoke-webgl.mjs | Chromium visual and functional tests for rendering, real C++ path results, command palette, Lab navigation, theme and responsive/mobile layout |

The main application orchestration still lives in App.jsx. A deeper
modular extraction into independently tested hooks, route modules and
design primitives is deliberately reserved for the remaining UX phases
instead of destabilizing the working engine/graph release.

## Visual system

- Dark: neutral graphite (#0B0C0E canvas, #121316 surfaces). Light: warm
  paper (#F1F0EC canvas, #FBFAF8 surfaces). Both are defined once in
  `styles.css`; the graph canvas follows the theme.
- One accent, amber (#F59E3B dark / #C9620C light), reserved for routes,
  selection and focus. Primary buttons are neutral.
- Compound classes use muted, distinct hues shared by the map, legend,
  directory and inspector.
- System UI font at a 13px base, sentence-case labels, monospace only for
  equations, SMILES and commands.
- 6–10px radii, hairline borders, no blur or glass effects.

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
- Use fit/zoom buttons and the optional **Diagram** renderer.
- Use **Neighborhood** for a bounded, indexed subgraph,
  then **Full graph** to restore the normal visualization.

### Algorithm Laboratory

**Compare** shows the Optimize tools; **Laboratory** shows the Learn and
Experiment tools in one tab row. Every existing engine action remains
available.

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
