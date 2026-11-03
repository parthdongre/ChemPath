# Milestone C — Disk-backed ORD graph and reproducible benchmarks

**Scope:** Phases 6 and 7 of the ChemPath DSA roadmap. This is graph
algorithm engineering, not chemical feasibility prediction.

## Phase 6: On-demand ORD graph traversal in C++

Previously, ChemPath could import ORD records and browse bounded SQLite
neighborhoods, but the full indexed dataset was not traversable from C++.
This implementation adds:

- **OrdGraphProvider.hpp/.cpp**: C++17 read-only SQLite prepared statements,
  breadth-first search, a bounded LRU adjacency cache, and explicit limits.
- **engine/src/main.cpp**: ordpath command in the persistent C++ worker.
- **server/index.js**: GET /api/ord/path, with validated query budgets.
- **web/src/components/OrdExplorer.jsx**: route search with complete versus
  incomplete results, ORD reaction IDs, query metrics and cache counts.
- **scripts/index-ord-graph.py**: idempotent migration for existing indexes.

### Model and complexity

Input identities are exact strings from ord_participants.smiles; the existing
importer removes atom maps but does not fully canonicalize SMILES. Directed
edges connect recorded reactants to recorded products, assuming all other
reactants are available. Agents are not sources of participation edges.
This is not synthesis feasibility and does not calculate optimum reaction
sets with multiple required reactants.

Each compound expansion uses the existing smiles-first SQLite primary key,
plus a reaction-id-first B-tree index on (reaction_id, role, smiles) to read
ALL product participants for a matched reaction.

The C++ search uses a FIFO queue, visited-compound hash map, immutable parent
links, and an adjacency LRU built with a hash map plus linked list. BFS
visits the graph portion reached before termination, in O(Vr + Er) graph
steps, plus indexed on-disk B-tree access. Real runtime depends on disk,
data distribution, and SQL planner. The cache has a configurable byte
budget; per-query search state and SQLite internals are additional memory.

**Correctness:** If BFS reaches the target, its participation-edge count
is minimal. If it exhausts the queue, the target is unreachable within
the indexed dataset. If maxExpanded, maxVisited, maxNeighborLinks, or
the display-path cap interrupts processing, the result is INCOMPLETE
(complete=false) and must NOT be described as globally unreachable.

### Running on Mac or Linux

CMake needs SQLite3 development headers to build the optional ORD C++ module.
The original curated and Rhea algorithms continue building without them.

~~~bash
python3 scripts/index-ord-graph.py --db data/ord/ord.sqlite
npm run build:engine
CHEMPATH_ORD_DB=data/ord/ord.sqlite \
  ./engine/build/chempath ordpath CCO 'CC=O' 2500 20000 25000 8
npm run dev
~~~

The CLI parameters are source, target, max expanded, max visited,
max neighbor links per expansion, and LRU size in MiB.

REST example:

~~~text
GET /api/ord/path?from=CCO&to=CC%3DO&maxExpanded=2500
~~~

The response contains source/target, found, complete, limitReason, compounds,
ORD record IDs, elapsedMs, SQL calls, cache hits/misses, visited, expanded
and examined participation links. The existing bounded-neighborhood
visualization remains a separate graph browsing feature.

For a fresh ORD import, use the existing ORD requirements and importer:

~~~bash
python3 -m pip install -r scripts/requirements-ord.txt
python3 scripts/import-ord.py --limit 20000
# Or, with adequate disk and download capacity:
python3 scripts/import-ord.py --all
~~~

The local ORD SQLite index and Parquet data stay out of the Git repository.

## Phase 7: Quantitative benchmark evidence

The benchmark compares the SAME deterministic source-target pairs in separate
processes, using three access strategies:

- **eager**: fully materialize a small ORD-shaped graph in memory and run BFS
- **lazy**: persistent read-only SQLite + cached C++ BFS
- **cold**: open fresh SQLite connection for every search

Use scripts/generate-ord-benchmark.py to create an explicit SYNTHETIC
graph fixture. Its IDs are not valid SMILES or verified chemistry.
Its three disconnected subgraphs and directed shortcuts generate reachable,
unreachable, and same-source-target cases with a fixed seed.

engine/bench/benchmark_ord.cpp reports per-query latency, exact
found/hop results, SQL calls, cache stats and process peak RSS. Eager
materialization and persistent SQLite setup time are measured separately.
Cold timings include new connection setup on every request.

scripts/summarize-ord-benchmarks.py calculates p50, p95 and mean latency,
setup time, peak RSS, mean SQL calls, and incomplete query counts. It
compares every complete lazy and cold result with the eager reference and
**fails CI if there is a discrepancy**. Raw CSV files, query pairs, fixture
manifests, JSON report and Markdown report are uploaded as the GitHub
Actions artifact **chempath-milestone-c-benchmark-evidence**.

### Reproduce all benchmark tiers

~~~bash
mkdir -p /tmp/chempath-ord-bench
for nodes in 900 3000 9000 30000; do
  d="/tmp/chempath-ord-bench/$nodes"
  python3 scripts/generate-ord-benchmark.py \
    --output-dir "$d" --nodes "$nodes" --queries 25 --seed 42
  python3 scripts/index-ord-graph.py --db "$d/ord.sqlite"
  for mode in eager lazy cold; do
    ./engine/build/chempath_ord_bench "$d/ord.sqlite" \
      "$d/queries.tsv" "$mode" 2 > "$d/$mode.csv"
  done
done
python3 scripts/summarize-ord-benchmarks.py \
  --input-dir /tmp/chempath-ord-bench \
  --out /tmp/chempath-ord-bench
~~~

### Exactness tests

engine/tests/test_ord_graph_provider.cpp uses an independent materialized
graph reference and checks all shortest hop counts, disconnected cases,
cycles, high-degree expansions, agents versus reactants, source-target
identity, cache reuse/eviction, limit flags and missing SQLite files.
scripts/test-ord-api.mjs verifies the same capabilities through the Node API
and the persistent C++ worker.

~~~bash
npm run build:engine
npm run test:engine
node scripts/test-ord-api.mjs
npm run build:web
~~~

### What this does not demonstrate

The CI performance experiment is a **synthetic indexed dataset comparison**,
not a full real-world ORD corpus benchmark. Exact full-corpus queries can
still require significant disk IO, search-state memory and time. The lazy
algorithm may be slower per query than eager in-memory BFS; its main
advantage is avoiding complete dataset materialization. Do not claim a
speedup without measurement, and do not interpret returned graph paths as
chemically feasible synthesis routes.
