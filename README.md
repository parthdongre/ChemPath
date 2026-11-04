# ChemPath Studio

**ChemPath** is an interactive chemical reaction-network explorer built as a Data Structures course project. The C++17 engine stores and searches the full reaction graph, while the browser renders a focused working set so the catalog can grow without forcing Cytoscape to lay out every compound at once.

> **Two separate scales:** The curated reaction graph contains 690 compounds, 884 reaction records and ~3,044 directed participation links. The default extended catalog now supports **8,000,000 real PubChem CID–SMILES records** (optional full-source mode), with indexed disk search rather than a massive browser graph. Install or upgrade once with `npm run data:8m`. It does not imply 8 million connected reaction pathways.

## Product workspace (Studio UI)

ChemPath Studio is now a desktop-style, graph-first interface. Its
**Explore**, **Compare**, **Laboratory** and **Data Library** views share a
compact navigation shell without changing the C++17 engine or HTTP API.

- **Explore:** choose source/target compounds, run an algorithm instantly,
  inspect a route in the right panel, or explicitly replay traversal steps.
  Graph clicking selects the source; **Shift-click** selects the target.
  Reaction edges can be inspected in the contextual panel.
- **Compare:** optimized algorithms, alternative paths, constraints and
  Pareto analysis, consolidated into grouped Laboratory tools.
- **Laboratory:** Learn / Optimize / Experiment groupings for existing DSA
  traces, SCCs, graph playground and benchmark instruments.
- **Data Library:** curated compound directory, an optional **8M real PubChem CID–SMILES catalog**, and indexed ORD reaction database.
- **Quick commands:** **⌘K** on macOS, **Ctrl+K** elsewhere, or **/** when
  not editing text. Search indexed compound names and change source/target.
- **Appearance:** dark graphite and light themes, a collapsible sidebar,
  and a graph inspector with responsive mobile drawer behavior.

The interface and browser interactions are verified in real Chromium by
the [Deployability and WebGL UI](.github/workflows/deployability.yml)
workflow, which uploads desktop, widescreen and mobile screenshots.
**This is a UX layer over actual data; none of the screenshots are mocks.**

See [Studio design/implementation notes](docs/STUDIO_UI.md) for tokens,
architecture, a walkthrough, and remaining accessibility/polish work.

## Extended compound catalog: 8 million PubChem structures

ChemPath Studio's default extended catalog now supports **8,000,000 genuine
PubChem compound CID/SMILES records** in an indexed SQLite database. Full
PubChem CID–SMILES import remains opt-in. The C++ reaction graph and its
actual reaction edges remain independent.

```bash
npm run data:8m      # Build/upgrade to the recommended 8M compound catalog
npm run data:sync    # After git pull: skip if 8M or more is already installed
npm run data:500k    # Legacy smaller catalog; never downgrade larger installs
npm run data:full    # Optional full PubChem CID–SMILES corpus
npm run dev          # Data Library → PubChem compound catalog
```

These files are local and gitignored: Git pulls do **not** re-download them,
and unsuccessful upgrades do not replace a working catalog. The UI shows the
actual installed count and prompts to upgrade a smaller installation.

See [PubChem catalog installation and indexing guide](docs/PUBCHEM_CATALOG.md)
for source attribution, disk/storage considerations, optional full-corpus
behavior and the distinction between structures and reaction connectivity.
Offline release tests use small fixtures; they do not claim an 8M import.

## End-semester release verification and demo

After installing dependencies, you can verify the curated C++ engine, DSA
algorithms, backend APIs, synthetic ORD SQLite integration, React production
build and single-origin deployment **offline in one command**:

~~~bash
npm install
npm run verify:release
# Optional detailed JSON checklist for a project report:
npm run verify:release -- --report /tmp/chempath-review.json
npm run dev
~~~

The offline check does not download full Rhea or ORD source files.
The optional ORD full index must be imported separately. See the
[final review guide](docs/FINAL_REVIEW.md) for a seven-minute demonstration,
file-by-file algorithm explanations, viva questions and limitations.

## Core idea

Chemical compounds are represented as graph vertices and documented educational transformations as directed edges. ChemPath lets the user inspect that graph with multiple algorithms while seeing the traversal happen step by step.

The React frontend does **not** implement the algorithms. It requests a result from the C++ engine and displays it immediately. Users may optionally replay the returned visit order for presentation and learning; replay duration scales with traversal size.

## Algorithms and data structures

| Structure / algorithm | ChemPath usage |
| --- | --- |
| Forward/reverse CSR graph | Default contiguous production storage and search |
| Adjacency-list graph | Reference backend and legacy DSA Lab compatibility |
| Constrained Dijkstra + Yen | Block reactions/compounds and rank loopless alternatives |
| Multi-label Pareto Dijkstra | Non-dominated reaction-step / graph-weight tradeoffs |
| Hash table | Compound name → integer vertex ID |
| Queue + BFS | Minimum number of reaction edges |
| Priority queue + Dijkstra | Minimum algorithmic graph weight |
| A* | Guided weighted search with an admissible reverse-hop heuristic |
| Dial buckets | Weighted shortest path optimized for small positive integer weights |
| Bellman-Ford | Repeated-relaxation shortest path baseline |
| Two BFS frontiers | Bidirectional unweighted path search |
| Two priority queues | Bidirectional Dijkstra |
| Explicit stack + DFS | Reachability exploration |
| Three-state DFS | Directed cycle detection |
| Low-link stack + Tarjan | Strongly connected components |
| Parent arrays | Path reconstruction |
| Trie | Compound/formula prefix search |

## Chemistry audit

The original dense prototype intentionally favored graph density and contained several generalized or chemically misleading edges. The current dataset was rebuilt around curated reaction families.

Each reaction now stores:

- named reactants and products,
- an equation or standard reaction scheme,
- conditions / reagents,
- whether the chemistry is reversible,
- a source-family key,
- an algorithmic graph weight.

The frontend exposes these fields when a path is found.

See **data/CHEMISTRY_AUDIT.md** for the source families, assumptions, and examples of reactions that were deliberately removed.

### Important limitation

ChemPath is still an **educational reaction-network model**, not a laboratory synthesis planner.

A graph edge means that a documented transformation connects those compounds under the stated conditions. It does not imply that simply mixing the displayed graph nodes will automatically produce the shown product. ChemPath can filter requirements that have been explicitly annotated for DSA demonstrations, but it cannot independently validate catalysts, solvent, temperature, pressure, concentration, selectivity, competing reactions, or laboratory safety.

The Dijkstra weight is also **not** an activation energy, free-energy change, yield, reaction time, price, or hazard score. It is an illustrative graph weight for demonstrating weighted shortest-path algorithms.

## C++ engine performance and validation

The engine now uses **contiguous forward and reverse CSR indexes by default**, built once while loading reactions. An adjacency-list reference backend remains available for controlled comparisons; legacy DSA Lab functionality can materialize adjacency vectors on demand. A*, bidirectional BFS, and bidirectional Dijkstra reuse the reverse CSR index. Minimum/maximum positive edge weights and directed-edge counts are cached.

Dial's shortest-path implementation uses **circular integer-weight buckets**
(`maxEdgeWeight + 1` buckets) rather than preallocating a deque for every
potential path distance. The bucket array uses O(C) storage for maximum edge
weight C, plus queued entries, instead of O(CV) bucket allocation for V
vertices. Bidirectional BFS uses an O(1) visited marker for replay deduplication.

The C++ regression tests check 384 deterministic source-target pairs (including long reachable routes), confirm
every returned path follows existing directed reaction edges, and compare
weighted algorithms against Dijkstra. These are regression checks, not a
mathematical proof of algorithm correctness.

### Reproducible benchmarks

Build optimized C++ binaries on Linux or macOS:

~~~bash
cmake -S engine -B engine/build-release -DCMAKE_BUILD_TYPE=Release
cmake --build engine/build-release --config Release
ctest --test-dir engine/build-release --output-on-failure -C Release
./engine/build-release/chempath_bench data/compounds.csv data/reactions.csv 128
~~~

Optional base-versus-optimized comparison (requires a local Git remote named
`origin` and the Release benchmark binary above):

~~~bash
bash scripts/compare-engine-baseline.sh
~~~

This compiles the original C++ engine from `main` against the same benchmark
harness, then reports both runs on identical query pairs. Differences vary by
compiler, hardware and workload; treat the timing results as measurements, not
promised speedups.

The benchmark runs seven pathfinding algorithms on the same deterministic
compound pairs and reports **p50/p95/mean elapsed microseconds**, average visited
nodes, found-path count, and cost checksums. It times only in-memory C++ searches:
process startup, CSV parsing, JSON serialization, HTTP, and graph rendering are
not part of these results. Compare performance on the same machine and build
settings; CI timings are informational, not fixed speed guarantees.

## WebGL graph explorer and public hosting

The **main compound network now defaults to Sigma.js 3 + Graphology** for
WebGL-backed rendering with stable coordinates and a bounded synchronous
ForceAtlas2 layout. A **Path Layout** toggle keeps the existing Cytoscape
renderer for the smaller directed and stepwise algorithm diagrams.

Click a compound to inspect it; choose **Expand neighborhood** to request a
bounded, bidirectional 1–3-hop subgraph from the API (max 1,200 nodes), or
return to the full displayed network. A backend snapshot is cached across
requests. The existing classroom graphs (690 compounds and optional 1,860
expanded compounds) are still fully loaded at application startup for the
compound catalog; this is **not** an ingestion implementation for the entire
2M+ Open Reaction Database.

### Single-service production deployment

The repository contains a multi-stage Dockerfile that compiles C++17 and
builds the React frontend, then runs **one Express service**. Express serves
both the Vite static assets and the persistent C++ API under \`/api\`.
Production \`VITE_API_URL\` defaults to a relative \`/api\`, removing the
need for cross-origin requests. Production services listen on \`0.0.0.0\`,
respect \`PORT\`, and expose the **\`/api/health\`** health check.

Build and test locally with Docker:

~~~bash
docker build -t chempath:local .
docker run --rm -p 8080:8080 chempath:local
# Visit http://localhost:8080/
~~~

To deploy on [Railway](https://railway.com/), import this GitHub repository
as a new service and select the root \`Dockerfile\`. The checked-in
\`railway.json\` configures the health check. Under Settings → Networking,
generate a public domain once deployment succeeds. The initial deployment
can use the curated \`data/\` dataset; set
\`CHEMPATH_DATA_DIR=/app/data/expanded\` to select the larger Rhea subset.

The small public demo has a per-instance in-memory API rate limiter
(default 120 requests/IP/minute), a 16-request engine queue bound, query
parameter validation, and a 30-second C++ worker timeout. These are **basic
abuse controls**, not a substitute for a gateway-level WAF, persistent rate
limiter, authentication, observability or multi-instance scalability.
Do not host it as an unrestricted compute service for untrusted workloads.

CI builds the real production Docker container and exercises the API and
Chromium/WebGL rendering. See
[docs/HOSTING.md](docs/HOSTING.md) for the full deployment checklist,
limitations and troubleshooting.

## DSA Algorithm Laboratory (end-sem upgrade)

The C++17 engine now has a dedicated **algorithm laboratory**. The
original traversal and shortest-path commands remain available.

- **Step-by-step traces:** C++ events for BFS (queue), DFS (stack), Dijkstra
  (heap/relaxations) and Tarjan (discovery and low-link). The React laboratory
  displays a synchronized focused Cytoscape graph, frontier snapshots,
  event timeline, pause/seek/single-step and playback speed.
  Other algorithms are compared via statistics, not misleadingly represented
  as Dijkstra's own internal events.
- **Algorithm comparison:** compare BFS, bidirectional BFS, Dijkstra, A*, Dial,
  Bellman-Ford, bidirectional Dijkstra and the research-inspired hybrid on
  the same source/target. BFS minimizes hops, weighted methods minimize the
  illustrative graph weights.
- **K alternatives:** Yen-style weighted **loopless** route search returns
  up to three (or ten in the CLI) routes, retaining real reaction-edge IDs.
- **Graph analysis:** Tarjan SCCs, condensation DAG/topological ordering,
  and DSU-based weak connectivity.
- **Data structures:** compare adjacency-list and CSR BFS traversal times,
  including approximate allocated graph-storage bytes. Generate seeded
  directed synthetic graphs (2–25,000 nodes, up to 250,000 edges) for
  controlled BFS/Dijkstra experiments.
- **Graph Playground:** temporarily remove, add or reweight a directed edge
  and recompute a weighted route. Synthetic edges are explicitly marked as
  nonchemical; nothing in the curated dataset is modified.
- **Trie inspector:** prefix traversal display backed by the existing C++
  Trie search.

The browser now supports fCoSE clustered layout, Dagre directed layout,
cached positions, and compound node inspection. These are visualizations
of **real graph operations**, not a chemistry synthesis planner.

The Node adapter uses one **persistent C++ process**, with tab-separated
line commands and one JSON response per request. The engine loads the
selected graph and its cached indexes **once** instead of reloading CSV
files on every HTTP request. Query execution is serialized. The CLI
retains its one-shot mode.

### Useful new CLI commands

~~~bash
./engine/build/chempath labtrace dijkstra Methane Bicarbonate
./engine/build/chempath labtrace bfs Methane Bicarbonate
./engine/build/chempath labtrace tarjan ignored
./engine/build/chempath labcompare Methane Bicarbonate
./engine/build/chempath labkpaths Methane Bicarbonate 3
./engine/build/chempath labcomponents
./engine/build/chempath labcsr 300
./engine/build/chempath labsynthetic 1000 4000 42
./engine/build/chempath labplayground Methane Bicarbonate 0 1 0
./engine/build/chempath serve --data data
~~~

The full API smoke test can be run after building C++ and installing Node
dependencies:

~~~bash
node scripts/smoke-api.mjs
~~~

See [docs/DSA_LAB.md](docs/DSA_LAB.md) for the precise data structures,
algorithm notes, route semantics and test coverage.

## Milestone B — production CSR, constrained routing and Pareto DSA

The C++17 engine now defaults to a **Compressed Sparse Row (CSR)**
forward/reverse graph rather than storing a vector allocation for every
vertex. Run `CHEMPATH_GRAPH_BACKEND=adjacency` to compare against the
reference representation. `stats` exposes the selected backend and
graph-core storage bytes. A versioned checksummed `.cpg` graph-core
export is also available via `chempath csrsave <prefix>`; this is not
an automatic metadata/startup cache.

- **Constrained routes:** Filter blocked compound/reaction IDs and optional
  structured reagent/catalyst requirements, then run Dijkstra or up to K
  Yen loopless alternatives. Unknown chemistry requirements are
  distinguished from confirmed absence of requirements.
- **Pareto shortest paths:** Multi-label Dijkstra produces non-dominated
  routes across reaction count and illustrative weight. A third reagent
  occurrence objective is enabled only when source requirements are
  explicitly annotated. Label budgets produce an **incomplete** flag, not
  a false claim of global optimality.
- **Educational semantics:** Both optimizers use the participation graph.
  The separate `feasible` command from Milestone A handles multi-reactant
  AND-dependency closure. Neither mode certifies laboratory synthesis.

```bash
./engine/build/chempath stats
./engine/build/chempath constrained Methane Bicarbonate 3 "" "" "" "" allow
./engine/build/chempath pareto Methane Bicarbonate steps-cost 30000 8
./engine/build/chempath csrsave /tmp/chempath
```

The Algorithm Lab now includes **Constraints** and **Pareto** tabs.
See [docs/MILESTONE_B.md](docs/MILESTONE_B.md) for API contracts,
structured requirements, complexity, correctness tests and limitations.

## Large-scale ORD reaction database (millions of records)

### Bundled real ORD graph — runs immediately

This repository includes an independently licensed **10,000-reaction
ORD teaching sample with 17,700 compound structures** in
\`data/ord-demo/\`. It is a real, deduplicated reaction dataset exported
from the official ORD Parquet files, not a synthetic graph. To launch
the full DSA engine against this sample:

~~~bash
cd ~/Desktop/ChemPath-latest
git pull origin main
npm install
npm run build:engine
CHEMPATH_DATA_DIR=data/ord-demo npm run dev
~~~

This gives you a larger playable dataset *without installing Python*.
To switch back to the curated classroom dataset, run \`npm run dev\`
without setting \`CHEMPATH_DATA_DIR\`.

ChemPath now supports an **on-demand local SQLite index** of the official
[Open Reaction Database](https://huggingface.co/datasets/open-reaction-database/ord-data).
The full upstream source contains millions of records and roughly gigabyte-scale
Parquet files. The dataset files and SQLite database are downloaded on your
machine, not committed to Git and not fully materialized in React or the C++ ORD search. The C++ engine can traverse indexed neighborhoods lazily from SQLite.

### Mac / Linux: install and sample the ORD dataset

~~~bash
cd ~/Desktop/ChemPath-latest
git pull origin main
npm install

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements-ord.txt

# Download and index 20,000 real source rows (good for initial exploration).
python scripts/import-ord.py --limit 20000

# Start the existing DSA engine and the separate indexed ORD browser.
npm run dev
~~~

Open **http://localhost:5173/#ord-database**. Search by **reaction ID**
(\`ord-\` prefix) or **molecular SMILES prefix** (e.g., \`CCO\`).
Inspect reactions and load a bounded Sigma.js graph that explicitly includes
reaction nodes; multi-reactant reactions are NOT misrepresented as feasible
single-compound chemical transformations.

For the **complete official source collection**, after checking your free
disk space and installing the importer dependencies, run:

~~~bash
python scripts/import-ord.py --all
~~~

The importer processes Parquet in batches and resumes completed source files.
A full import requires substantial download space, SQLite storage and processing
time; the existing curated and Rhea datasets remain usable while no ORD index
is installed.

### New: C++ shortest paths directly over the disk-backed ORD index

Milestone C enables **C++ breadth-first search through the local full ORD
SQLite index**, fetching only the reactant→product participation links needed
for each expansion. The algorithm uses prepared SQL queries and an LRU
adjacency cache, but does **not** load all ORD reaction records into memory.

Upgrade an existing ORD SQLite database to the indexed graph schema:

~~~bash
python3 scripts/index-ord-graph.py --db data/ord/ord.sqlite
npm run build:engine
CHEMPATH_ORD_DB=data/ord/ord.sqlite ./engine/build/chempath ordpath CCO 'CC=O'
npm run dev
~~~

The ORD Explorer now includes a **C++ on-demand shortest-path** panel.
Every query clearly reports whether its result is complete or interrupted
by a resource limit; a capped search is never labeled globally unreachable.
The C++ search uses exact stored SMILES strings, not canonical molecular
identity, and participation paths are not synthesis-feasibility proofs.

### Reproducible DSA benchmark evidence

The same deterministic synthetic ORD-shaped graphs are benchmarked with
**eager in-memory BFS, persistent lazy SQLite BFS and cold SQLite BFS**.
C++ records per-query timings, SQL access and cache metrics, setup time
and process peak memory; the Python summarizer checks every exact path
against the eager reference before generating a Markdown/JSON report.
The full raw query pairs, CSV results and reports are downloadable as
GitHub Actions benchmark artifacts. **These fixtures are synthetic, not
real reaction examples**.

See [docs/MILESTONE_C.md](docs/MILESTONE_C.md) for algorithm complexity,
commands, tests, benchmark methodology and important limits.

**Measured Release-mode benchmark results (900–30,000 synthetic vertices):**
[docs/BENCHMARKS_MILESTONE_C.md](docs/BENCHMARKS_MILESTONE_C.md).
The report includes exact-result checks, p50/p95, RSS, setup times and
explicit limitations of small synthetic experiments.

### Use ORD with C++ BFS/Dijkstra/Tarjan

The full ORD index is **not** an in-memory C++ graph. Export a smaller
participation graph to the existing DSA CSV format:

~~~bash
python scripts/export-ord-graph.py --limit 10000
CHEMPATH_DATA_DIR=data/ord-demo npm run dev
~~~

This switches the C++ engine to the exported subset while retaining the
separate optional ORD SQLite explorer. For normal coursework, restart without
\`CHEMPATH_DATA_DIR\` to use the reviewed 690-compound dataset.

See [docs/ORD_DATA.md](docs/ORD_DATA.md) for importer options, attribution,
limitations, API contract, macOS commands, and hosting considerations.

## Complete Rhea import (Milestone A)

The previous importer was capped at 15,000 records. The updated version
supports all usable directed Rhea reaction-SMILES records in the pinned
upstream snapshot while preserving the smaller curated and bundled datasets.

```bash
python3 -m pip install rdkit
python3 scripts/import-rhea.py --all
CHEMPATH_DATA_DIR=data/rhea/full npm run dev
```

The source TSV is downloaded into ignored `data/rhea/cache/` on demand.
Full generated outputs are written into ignored `data/rhea/full/` so the
repository does not grow with the external source data. The export includes
`manifest.json` with exact counts and SHA256 provenance, plus a
`rhea-aliases.tsv` mapping duplicate directional transformations. For
reproducible offline imports, pass `--source-file /path/to/source.tsv`.
Use `--limit 1500` to reproduce the previous small import.

See [docs/RHEA_FULL.md](docs/RHEA_FULL.md) for tests and limitations.

## Optional larger Rhea reaction graph

The **validated classroom default remains 690 compounds and 884 curated
reactions**. The repository also includes a separately generated, attributable
**Rhea subset** in \`data/expanded/\`, containing a total of **1,860 compounds
and 2,384 reaction records**, including **1,500 Rhea reactions** (at the
imported snapshot). Compounds were normalized from Rhea reaction SMILES using
RDKit; Rhea entities use prefixed SMILES identifiers to avoid pretending
that a name-based and a structure-based record are interchangeable.

To launch with the larger dataset:

~~~bash
npm run build:engine
CHEMPATH_DATA_DIR=data/expanded npm run dev
~~~

On Windows PowerShell, set \`$env:CHEMPATH_DATA_DIR="data/expanded"\`
before \`npm run dev\`. Do not run the chemistry audit on the expanded
dataset: that audit is specifically for the curated manually reviewed dataset.

Recreate or adjust the imported subset (requires \`pip install rdkit\` and
internet access to Rhea):

~~~bash
python scripts/import-rhea.py --limit 1500 --output data/expanded
~~~

**Licensing and limitations:** The imported Rhea data is CC BY 4.0; see
[data/expanded/SOURCES.md](data/expanded/SOURCES.md) for the upstream URL,
attribution and SHA256 provenance. The ChemPath custom software license does
not supersede that data license. Imported reaction participation edges are
educational graph projections (co-reactants assumed available), **not**
laboratory-verified synthesis plans. The 2M+ record Open Reaction Database
is **not copied into Git**, because its Parquet/LFS dataset is much larger,
has its own CC BY-SA 4.0 obligations, and needs a separate streaming,
provenance-aware ingestion pipeline:
https://github.com/open-reaction-database/ord-data

## Adaptive algorithm replay

The actual C++ computation usually completes in milliseconds. ChemPath visually replays the returned traversal at roughly 200 ms per visited compound, capped at 2 minutes. Short searches finish quickly; larger searches remain visible long enough to explain during the review.

The replay shows the active compound, visited order, elapsed time, and final highlighted reaction path.

## Architecture

~~~mermaid
flowchart LR
    UI[React + Cytoscape.js] -->|HTTP| API[Thin Node adapter]
    API -->|execFile + JSON| CPP[C++17 ChemPath engine]
    CPP --> G[Adjacency-list graph]
    CPP --> Q[Queue / Stack / Priority Queue]
    CPP --> T[Trie + Hash Map]
    CPP --> D[(Chemistry-audited dataset)]
~~~

## Run locally

### Requirements

- CMake 3.16+
- C++17 compiler
- Node.js 20+
- npm

On macOS with Homebrew:

~~~bash
brew install cmake
~~~

### First run

~~~bash
npm install
npm run build:engine
npm run test:engine
npm run dev
~~~

Open:

~~~text
http://localhost:5173
~~~

The Node adapter runs on:

~~~text
http://localhost:8787
~~~

### After pulling C++ or dataset changes

~~~bash
git pull
npm run build:engine
npm run test:engine
npm run dev
~~~

## C++ CLI

~~~bash
./engine/build/chempath stats

./engine/build/chempath path Methane Bicarbonate
./engine/build/chempath dijkstra Methane Bicarbonate
./engine/build/chempath astar Methane Bicarbonate
./engine/build/chempath dial Methane Bicarbonate
./engine/build/chempath bellmanford Methane Bicarbonate
./engine/build/chempath bidirectional Methane Bicarbonate
./engine/build/chempath bidijkstra Methane Bicarbonate
./engine/build/chempath duan2025 Methane Bicarbonate

./engine/build/chempath reachable Methane
./engine/build/chempath cycles
./engine/build/chempath scc
./engine/build/chempath search meth
~~~

## Suggested mid-sem demonstration

1. Show the 500+ compound reaction network and explain the adjacency-list representation.
2. Run **BFS** from Methane → Bicarbonate and let the 10-second replay finish.
3. Point to the reaction metadata shown below the final route.
4. Switch to **Dijkstra** and explain the priority queue and artificial graph weights.
5. Run **Bidirectional BFS** and explain the two search directions.
6. Run **DFS Explore** from Methane to show reachability.
7. Run **Tarjan SCC** to highlight mutually reachable regions created in part by genuine reversible equilibria.
8. Type "meth" in the compound finder and explain Trie prefix lookup.
9. Show the C++ source/tests and data/CHEMISTRY_AUDIT.md.

---

**ChemPath — watch graph algorithms move through chemistry.**


## 2025 shortest-path research mode

ChemPath includes an educational **Pivot-Frontier Hybrid** inspired by the ideas in:

Ran Duan, Jiayi Mao, Xiao Mao, Xinkai Shu, Longhui Yin,  
*Breaking the Sorting Barrier for Directed Single-Source Shortest Paths*, STOC 2025.  
https://arxiv.org/abs/2504.17033

The paper proves a deterministic `O(m log^(2/3) n)` algorithm for directed non-negative SSSP in the comparison-addition model. ChemPath does **not** claim to reproduce that full BMSSP construction. Its research mode demonstrates the paper's high-level combination of unsorted Bellman-Ford-like frontier relaxation with a later ordered cleanup, while preserving exact shortest-path output for the demo.


## Two graph semantics: participation versus AND-dependency

**Legacy participation search (BFS, Dijkstra, A*, Yen, etc.):**
The implementation in `ReactionGraph::loadReactions` projects each listed
reactant to each product. It assumes that *other reactants are available*.
For reversible records, the legacy implementation adds one explicitly
designated primary-product-to-primary-reactant reverse edge. Such compound
paths are useful for DSA teaching but **not proof that one compound alone
can produce another**.

**New multi-reactant dependency closure (AND semantics):**
The separate C++ `ReactionDependencyGraph` represents each reaction with
all required input compounds. A reaction activates only when all distinct
reactants are available; its products then become available. Reversible
records add full reverse *requirements*, not the legacy primary reverse
edge. This solves an availability/reachability problem rather than an
optimal synthesis-planning problem. Reagents and laboratory conditions
are not verified.

Run the new algorithm against the selected data directory:

```bash
./engine/build/chempath feasible "Water;Carbon Dioxide" "Bicarbonate"
```

The DSA Lab has a **Dependencies** tab for the new algorithm. Ordinary
algorithm tabs remain explicitly labeled participation-graph results.

## Mid-semester curated dataset

For the mid-semester review, ChemPath intentionally uses a **690-compound curated network** instead of the earlier ~2,900-compound stress-test catalog. This keeps the frontend responsive and the chemistry easier to explain while still giving the C++ algorithms hundreds of vertices and thousands of directed edges.

The live graph renders at most about 520 focused compounds, while search and algorithms use all 690 compounds.

## Target selection and cross-network paths

The target picker shows the full compound catalog rather than hiding disconnected compounds. ChemPath computes a C++ BFS hop-distance index from the selected source and labels every target with its current shortest hop count, while compounds not connected in the current dataset remain visible as **NO CURRENT PATH**.

The default graph is a **full reaction-product network**: any recorded reaction product, including a chemically valid byproduct, may become the next graph vertex. This intentionally enables cross-network routes. For example, Oct-1-ene can reach sulfur dioxide because hydroboration-oxidation gives octan-1-ol, and conversion of that alcohol with thionyl chloride produces SO2 as a byproduct.

A stricter future "primary product only" mode could be used for more synthesis-like route planning, while the default mode remains useful for Data Structures exploration of the complete reaction network.


## Cross-domain connectivity

The graph now includes a deliberately small set of real hub transformations that connect previously isolated chemistry regions:

- CO2 -> glucose by overall photosynthesis
- glucose -> ethanol + CO2 by alcoholic fermentation
- CO2 + NH3 -> urea and urea -> NH3 + CO2
- NH3 -> NO -> NO2 through the Ostwald chemistry already represented in the network
- N2 + H2 -> NH3 by Haber-Bosch synthesis
- cysteine -> pyruvic acid + NH3 + H2S by cysteine desulfhydrase
- primary alcohol -> alkene dehydration as a possible product family
- alkyl chloride -> primary amine using excess ammonia
- one-carbon Grignard/formaldehyde homologation along the C1-C20 primary-alcohol series

These are not zero-context shortcuts: every edge stores conditions and notes. The long-route effect is intentional. For example, Carbonic Acid can now reach Nitrogen Dioxide in 5 graph steps and Eicosan-1-ol in 39 graph steps.


## Compound search

Compound selection still supports fuzzy name/formula/category matching, common aliases, atom-family filters, reachable-target hop counts, and keyboard navigation. With the smaller catalog, these controls are now faster and simpler for the review.

## Reaction participation semantics

ChemPath now projects every listed reactant to every recorded product for a reaction. This means the currently selected compound may participate as a substrate **or as a listed co-reactant/reagent**, while the remaining required reactants are assumed available.

Example:

Ammonium Chloride -> Ammonium -> Ammonia -> Nitric Oxide -> Nitrogen Dioxide

This is intentionally a **reaction-participation graph**, not a one-bottle synthesis planner. The UI and viva explanation should state that required co-reactants/conditions are supplied by the reaction record.


## License

ChemPath is distributed under the **ChemPath Custom Academic & Non-Commercial License v1.0**.

You may study, run, fork, modify, and redistribute the project for personal, educational, academic, and non-commercial research purposes with attribution. Commercial use requires separate permission, and substantially unchanged copies may not be presented as another person's original coursework, hackathon submission, or competition project.

See [LICENSE](LICENSE) for the complete terms.
