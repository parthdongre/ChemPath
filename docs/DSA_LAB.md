# ChemPath DSA Laboratory — Engineering Notes

## Design boundaries

ChemPath has two datasets:
- \`data/\`: **curated** 690-compound, 884-reaction educational network.
- \`data/expanded/\`: **optional attributed Rhea subset** (1,860 compounds,
  2,384 total reaction records; see \`data/expanded/SOURCES.md\`).

Each recorded reaction is represented as directed *participation* edges, from
each listed reactant to each listed product, with additional co-reactants
implicitly available. This graph is suitable for learning DSA; no shortest
compound-to-compound path is guaranteed to be a feasible synthesis.

## Main data structures

| Structure | Why / where | Typical cost |
| --- | --- | --- |
| \`vector<vector<Edge>>\` | Sparse directed weighted graph; efficient neighbors | O(V+E) storage |
| Reverse adjacency list | A*, bidirectional BFS and bidirectional Dijkstra | O(V+E) built once |
| \`unordered_map<string,int>\` | Normalized compound-to-ID index | O(1) expected lookup |
| Trie with hashed child links | Search chemical name/formula prefixes | O(L) prefix descent |
| \`queue<int>\` | BFS and reverse-distance index | O(V+E) |
| \`stack<int>\` | DFS | O(V+E) |
| Binary priority queue | Dijkstra and A* | O((V+E) log V) typical |
| Circular integer buckets | Dial shortest paths, bounded edge weights C | O(C) bucket array plus entries |
| DSU (path compression + union by size) | Weak connected-component identification | O(alpha(V)) amortized |
| SCC condensation DAG | Collapse mutually reachable groups | O(V+E) |
| CSR offsets + contiguous edges | Benchmarkable static graph representation | O(V+E) space |
| Ordered candidate paths | Yen-style K loopless alternatives | Typically O(K V (E+V log V)) with simple Dijkstra subproblems |

V is vertex count, E directed edge count, L prefix length, C maximum integer edge
weight, K requested alternative paths. Bounds are implementation-oriented;
particular graph families and heap details affect constants.

## Visualization semantics

The C++ core computes event traces separately from the fast production
shortest-path methods. These traces carry operation type, active vertex,
optional source/target, current distance or low-link, and up to 16 frontier
entries as a compact snapshot. The trace is capped at 1,200 events by default.
A focused network subset is drawn with Cytoscape; omitted faraway nodes remain
accessible in the textual trace/summary. The trace visualizations currently
cover BFS, DFS, Dijkstra and Tarjan.

The comparison endpoint runs **eight real C++ algorithms**, measuring the
in-memory operation around each algorithm call. Comparisons must respect
unweighted vs weighted objectives. Dijkstra's graph weights are artificial:
they do not represent yield, price, reaction kinetics or safety.

## Path alternatives and sandbox

The K-shortest algorithm uses Yen's root/spur method and Dijkstra with
blocked-prefix vertices and edges. Each candidate route must be loopless,
and edge identity includes both endpoint IDs and reaction ID. The sandbox
supports:
- Removing one existing directed edge.
- Replacing an existing edge's weight with an ephemeral synthetic edge.
- Adding a synthetic directed edge between selected compound IDs.

Synthetic paths are marked as nonchemical and are never persisted.

## Engine process model

In ordinary CLI mode, the dataset is read once per invocation. With
\`chempath serve --data data\`, the process reads tab-separated requests
from stdin and writes one JSON object per line to stdout. The Node adapter
serializes requests through a single child process, validates control
characters, restarts after failures and limits each request to 30 seconds.
This reduces HTTP-path overhead from repeated C++ process startup and CSV
reloads. This worker model is local and single-process; it is not a
multi-tenant internet service or a distributed job queue.

## Validation

- Existing curated chemistry audit: 884 records, balanced equations and
  marked educational schemes.
- C++ regression suite: 384 deterministic source-target queries across
  shortest-path algorithms, plus event traces, Yen routes, DSU/DAG, CSR,
  synthetic and sandbox invariants.
- API smoke test: persistent CLI, JSON contract, routes, SCC, benchmark,
  simulation and HTTP error statuses.
- GitHub Actions: C++ Debug and Release builds/tests, web build, CLI smoke,
  API smoke and expanded graph smoke.

## Benchmark caveats

Small microsecond-scale query timings fluctuate with compiler, CPU governor,
cache warmth and runner load. The CSR storage figures estimate graph vector
capacity only; they do not include allocator metadata, all application
objects or OS process memory. Present measured numbers with the exact graph
dataset, build flags, query pairs and warm-up policy. Do not claim benchmark
results as chemistry accuracy or as latency guarantees.

## Future extensions (not falsely claimed as implemented)

- A persistent full 2M+ reaction ORD store with streaming Parquet import,
  chemical validation, licensed provenance and subgraph queries.
- Catalyst-aware hypergraph planning with all co-reactants, solvent,
  temperature, selectivity, confidence and reaction directionality modeled.
- Distributed execution, unbounded event streams and production auth/rate
  limiting for a hosted public service.
- Trace instrumentation of Bellman-Ford, A*, Dial, and both bidirectional
  algorithms with their **actual** internal frontier semantics.
