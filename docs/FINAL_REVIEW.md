# ChemPath — Final DSA Project Review and Demonstration

**Project title:** Graph-Based Path Optimization in Chemical Reaction Networks  
**Purpose:** Teach and evaluate data structures, graph algorithms, constrained
search, multi-objective optimization, and scalable graph access over chemical
reaction-participation data.

> This is a **Data Structures & Algorithms project**. It does not predict
> reaction products, certify laboratory syntheses, estimate chemical yields,
> or guarantee catalyst/condition validity.

## 1. Run the complete offline review in one command

~~~bash
git clone https://github.com/parthdongre/ChemPath.git
cd ChemPath
npm install
npm run verify:release
# Optional: keep a machine-readable dated report outside the repo.
npm run verify:release -- --report /tmp/chempath-review.json
~~~

This command does not download external datasets. It runs seven checks:

1. Curated chemistry data audit.
2. CMake C++ engine build.
3. CTest regression suites (including dependencies, CSR, constraints,
   Pareto and optional SQLite ORD tests).
4. Persistent C++ / Node API smoke test.
5. Temporary synthetic ORD SQLite integration test.
6. React production build.
7. Single-origin production API and React smoke test.

**Important limitation:** Full upstream Rhea downloads are exercised in the
GitHub CI workflow, not this intentionally offline command. A complete
real-world ORD corpus requires a separately imported local SQLite index.

To run the website:

~~~bash
npm run dev
~~~

Open http://localhost:5173. The Node API is normally on port 8787.

## 2. Suggested seven-minute live review

| Time | UI/CLI action | Explain |
|---|---|---|
| 0:00–0:45 | Open ChemPath network explorer | Compounds are graph vertices. Reaction-participation relationships are directed, weighted edges. Browser renders a focused subgraph rather than the complete dataset. |
| 0:45–1:45 | Select Methane → Bicarbonate, compare BFS/Dijkstra/A* | BFS minimizes **number of edges**; Dijkstra minimizes **illustrative graph weight**; A* uses a reverse-hop admissible heuristic. Neither proves synthesis feasibility. |
| 1:45–2:45 | Open DSA Algorithm Lab → Execution / Components | Show queue or priority queue event order, SCCs with Tarjan and graph search traces. |
| 2:45–3:35 | DSA Lab → Dependencies | Ordinary participation edges can implicitly assume missing co-reactants. New AND-dependency closure activates a reaction only after **all distinct required inputs** are available. |
| 3:35–4:25 | DSA Lab → Constraints | Block selected reaction IDs/compound IDs. C++ filtered Dijkstra and Yen alternatives recompute available graph routes. Structured catalyst/reagent metadata can be absent; unknown is not zero. |
| 4:25–5:10 | DSA Lab → Pareto | Explain non-dominated paths in reaction count vs graph weight; optional third objective counts annotated reagent occurrences. Observe the **complete** flag for label-budget limits. |
| 5:10–6:00 | Open ORD Database / local indexed route panel | C++ performs on-demand read-only SQLite BFS. Exact shortest paths are distinguished from incomplete/capped searches. The optional full ORD index is not bundled. |
| 6:00–7:00 | Show benchmark evidence / GitHub Actions | Production forward/reverse CSR saves ~30.3% graph-core bytes on the curated network. Compare eager, lazy and cold ORD strategies with raw data, not invented speedups. |

If no ORD SQLite index is installed, show the bundled real ORD teaching
sample or the passing ORD integration test results. Do not improvise a
nonexistent large-corpus availability claim.

## 3. Code modules and what your examiner may ask

| Module / file | DSA concept | Why used |
|---|---|---|
| engine/src/ReactionGraph.cpp | Directed graph, BFS, DFS, Dijkstra, A*, bidirectional search | Reference and optimized graph-traversal strategies |
| engine/src/CSRGraph.cpp | Compressed Sparse Row, offsets and contiguous edges | Lower graph-core memory overhead and cache-friendly iteration |
| engine/src/ReactionDependencyGraph.cpp | AND-dependency hypergraph closure, incidence index, FIFO work queue | Prevents incorrect activation of multi-input reactions |
| engine/src/ConstrainedSearch.cpp | Filtered Dijkstra + Yen loopless K routes | Finds valid *graph* alternatives under explicit restrictions |
| engine/src/MultiObjective.cpp | Multi-label shortest paths, Pareto dominance | Preserves tradeoffs rather than forcing a single weighted score |
| engine/src/OrdGraphProvider.cpp | SQLite B-tree index, BFS, hash table, LRU cache | Searches disk-backed graphs without loading all records |
| engine/src/Lab.cpp | Event tracing, SCCs, DSU, K paths and synthetic graphs | Step-by-step DSA comparison and teaching |
| engine/bench/benchmark_engine.cpp | Deterministic query sampling, quantiles | Reproducible baseline algorithm comparison |
| engine/bench/benchmark_ord.cpp | Eager/lazy/cold graph access | Separates load time, query latency and process memory |
| scripts/summarize-ord-benchmarks.py | Independent result comparison, p50/p95/mean | Makes performance claims inspectable and falsifiable |
| server/index.js | Persistent C++ worker and HTTP protocol | Lets React call C++ implementations without duplicating algorithms |
| web/src/components/LabPanel.jsx | Event replay and result presentation | Visualizes C++ decisions without implementing search in JavaScript |

### Eight useful viva questions

1. **Why BFS rather than Dijkstra?** For unweighted hops, BFS takes
   O(V+E); for positive weighted edges, use Dijkstra with a priority queue.
2. **Why CSR instead of vectors of vectors?** CSR uses one contiguous
   edge array and an offset array instead of per-vertex vector allocations;
   it performs well for mostly static graphs. Graph edits or inserts are
   more expensive, so the DSA sandbox uses separate working graph state.
3. **Is a chemical reaction a normal graph edge?** Not necessarily. A
   multi-reactant reaction has AND requirements. Legacy graph edges model
   participation, not real synthesis. The dependency engine models
   reachability given an initially available set.
4. **Does your AND-dependency engine find the optimal synthesis route?**
   No. It computes a monotone availability closure, assuming reusable
   compounds and not tracking stoichiometric consumption/cost.
5. **How do constraints work?** Dijkstra skips excluded vertices and
   reactions, then Yen enumerates loopless alternatives using spur paths.
   Structured requirements may be unknown and are handled by policy.
6. **What is a Pareto-dominated route?** If another route is no worse
   on every objective and strictly better on at least one, the route
   is dominated and can be pruned. Bounded-label mode may be incomplete.
7. **How can ORD search be exact if it only loads some data?** Indexed
   SQLite queries return complete neighbors on each expanded vertex.
   BFS is exact if it finds the target or exhausts the frontier without
   hitting an explicit resource cap.
8. **Why isn't lazy indexed BFS always faster?** Each expansion can
   require SQL B-tree and disk accesses. In-memory BFS wins for a small
   preloaded graph; lazy access primarily avoids eagerly loading the
   entire corpus. Cache reuse reduces repeated SQLite queries.

## 4. Known limitations you must state accurately

- Rhea full usable import was validated in CI with source provenance, but
  the large generated graph is stored in an artifact / ignored local directory.
- Full ORD requires an imported local indexed SQLite database; the supplied
  sample and synthetic benchmarks do not validate a 2M+ live search.
- Graph weights are **teaching weights**, not actual energy, yield or
  manufacturing cost.
- Participation shortest paths assume needed co-reactants, and simple
  dependency closure does not optimize combined resource usage.
- Catalyst/reagent constraints require explicit sidecar metadata. Missing
  information is **unknown**, not evidence of chemical feasibility.
- Performance depends on the host computer and size/distribution of the
  searched graph. Report setup, query time, memory, and completeness
  separately.

## 5. Evidence and links

- [Milestone A: dependency graph and full Rhea importer](RHEA_FULL.md)
- [Milestone B: CSR, constraints, Pareto](MILESTONE_B.md)
- [Milestone C: lazy ORD and reproducible benchmarks](MILESTONE_C.md)
- [Actual benchmark results, with methodology and caveats](BENCHMARKS_MILESTONE_C.md)
- [DSA lab algorithm notes](DSA_LAB.md)
- [Chemistry dataset audit](../data/CHEMISTRY_AUDIT.md)

For presentation, demonstrate behavior from the **same checked-out revision**
that passed the release verification. A green CI run does not automatically
prove that a different developer's machine has the optional ORD data installed.
