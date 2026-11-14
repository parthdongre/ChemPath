# ChemPath Milestone C — measured benchmark evidence

**Date:** November 3, 2026.
**Runner:** GitHub Actions Linux / AMD EPYC 7763 64-Core Processor.
**Compiler:** GNU C++ 15.2.0, optimized CMake Release configuration.
**Source:** deterministic SYNTHETIC ORD-shaped SQLite graph fixtures (seed 42).
**Query mix:** 25 fixed pairs, 2 repetitions = 50 observations per
representation per dataset; 200 observations per mode across four sizes.

The exact same source-target pairs were used for fully materialized
**eager BFS**, persistent **lazy SQLite BFS with 8 MiB LRU**, and **cold
SQLite BFS** (new read-only connection per query). The benchmarks were
executed in separate processes. The eager graph is entirely materialized
before timing the individual searches.

## Actual results from successful CI benchmark stage

| Vertices | Participation links | Mode | Setup ms | p50 ms | p95 ms | Mean ms | Peak RSS KiB |
|---:|---:|---|---:|---:|---:|---:|---:|
| 900 | 2,625 | Eager | 1.732 | 0.010 | 0.036 | 0.012 | 5,616 |
| 900 | 2,625 | Lazy LRU | 0.262 | 0.051 | 1.187 | 0.197 | 5,996 |
| 900 | 2,625 | Cold SQLite | 0.000 | 0.556 | 2.236 | 0.724 | 5,404 |
| 3,000 | 8,925 | Eager | 5.753 | 0.011 | 0.137 | 0.030 | 6,504 |
| 3,000 | 8,925 | Lazy LRU | 0.272 | 0.060 | 3.676 | 0.625 | 7,316 |
| 3,000 | 8,925 | Cold SQLite | 0.000 | 0.607 | 8.322 | 1.769 | 6,112 |
| 9,000 | 26,925 | Eager | 17.702 | 0.007 | 0.466 | 0.066 | 8,992 |
| 9,000 | 26,925 | Lazy LRU | 0.301 | 0.059 | 6.732 | 1.256 | 9,072 |
| 9,000 | 26,925 | Cold SQLite | 0.000 | 0.425 | 26.622 | 3.636 | 7,452 |
| 30,000 | 89,925 | Eager | 57.809 | 0.021 | 2.598 | 0.305 | 14,356 |
| 30,000 | 89,925 | Lazy LRU | 0.333 | 0.107 | 13.012 | 4.117 | 13,640 |
| 30,000 | 89,925 | Cold SQLite | 0.000 | 0.738 | 79.873 | 10.692 | 11,048 |

**Exactness:** ALL 50 source-target observations per dataset returned
identical found/unreachable status and shortest hop count across all
three modes. **Zero mismatches and zero incomplete searches** across all
four tiers. This is 200 checked query cases per mode and 600 measured
results in total. The small standalone C++ fixtures additionally verify
cycles, agent roles, multi-reactant participation semantics, cache
eviction, resource limits and unknown identifiers.

**SQL cache evidence:** At 30,000 vertices, lazy queries averaged
318.22 SQL calls versus 877.92 for cold queries on the same query mix.
That reduction results from reusing indexed adjacency lists.

## Interpretation (important for academic review)

- **Do not claim that lazy search is always faster.** The eager graph
  completed in-memory queries faster on these small synthetic fixtures.
  Lazy indexing avoids whole-graph materialization, but adds SQL IO.
- **Setup cost is distinctly lower for lazy access** at 30,000 vertices:
  0.333 ms to establish the provider versus 57.809 ms to materialize
  the synthetic eager graph. Cold mode times its connection creation
  inside each individual query, so its setup column is zero.
- **Total process memory on 30,000 vertices:** eager 14,356 KiB and
  persistent lazy 13,640 KiB. This is a measured difference of 716 KiB
  (~5%) on this particular synthetic graph, NOT a general 5% memory
  guarantee. At smaller sizes the direction of the RSS difference varies.
- The larger full ORD corpus has not been loaded or benchmarked end-to-end
  in these CI runs. This is reproducible evidence of correct lazy
  indexed traversal and its measured small-to-medium-scale tradeoffs.
- Neither the fixture labels nor the returned graph relationships
  establish chemical synthesis feasibility.
- Peak RSS includes the entire process and runtime, not only graph arrays.
  Microsecond-scale query timings fluctuate across CPU and CI runs.

## Inspectable, reproducible evidence

Successful GitHub Actions report artifact:
[Raw CSV, JSON, Markdown, manifests and query pairs](https://github.com/parthdongre/ChemPath/actions/runs/41692757369/artifacts/13257863509).

The artifact includes all four dataset manifests, deterministic query TSV
files, 12 per-mode CSV files, a parsed JSON report, and the generated
Markdown report. GitHub Actions artifacts have 30-day retention; this
summary stays in the repository.

The complete code to recreate the fixture and report is in
**scripts/generate-ord-benchmark.py**,
**engine/bench/benchmark_ord.cpp**, and
**scripts/summarize-ord-benchmarks.py**.

See [MILESTONE_C.md](MILESTONE_C.md) for the exact reproducible commands,
C++ algorithm design and validation boundaries.
