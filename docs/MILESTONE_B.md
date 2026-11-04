# ChemPath Milestone B — production CSR, constrained routes, Pareto search

This implements **only phases 3–5** of the DSA roadmap, stacked on
[Milestone A](../README.md). All algorithms remain in C++17. These are
graph-theoretic education tools, **not** validated laboratory syntheses.

## Phase 3: Production compressed sparse row (CSR)

The `ReactionGraph` default backend now builds contiguous **forward and
reverse CSR arrays** using prefix sums, then releases the nested adjacency
vectors. All its production pathfinding algorithms traverse `neighbors(u)`
and `incoming(u)`. The original `adjacency()` accessor lazily materializes
the old vectors only when a legacy DSA Lab route or test needs them.
The snapshot/graph explorer likewise obtains neighbors through CSR, rather
than materializing a second all-vertex adjacency list.

Toggle the reference representation for controlled comparisons:

```bash
./engine/build/chempath stats
CHEMPATH_GRAPH_BACKEND=adjacency ./engine/build/chempath stats
./engine/build/chempath_bench data/compounds.csv data/reactions.csv 128
CHEMPATH_GRAPH_BACKEND=adjacency ./engine/build/chempath_bench \
  data/compounds.csv data/reactions.csv 128
```

These benchmarks use the same deterministic source-target pairs. The
`graphStorageBytes` statistic covers only the forward/reverse core graph
arrays (and per-vertex vector capacity for adjacency mode), **not** compound
or reaction text, indexes, or working memory.

CSR construction is `O(V+E)` time and storage, with contiguous neighbor
ranges. A `CSRGraph` also supports a versioned, checksummed, little-endian
binary `.cpg` representation and rejects invalid lengths/edges/checksums.
Export the forward and reverse graph core:

```bash
./engine/build/chempath csrsave /tmp/chempath
```

This is a **graph-core export**, not a complete replacement for CSV loading
or metadata storage. It is not an automatic persistent startup cache.

## Phase 4: Constrained Dijkstra and Yen alternatives

`ConstrainedSearch` filters graph edges while doing real C++ Dijkstra and
Yen-style K loopless alternatives. Supported inputs:

- blocked directed reaction IDs
- blocked compound IDs
- available reagent names and available catalyst names
- explicit handling of **unknown requirements**: `allow` or `strict`

An optional file named `reaction_requirements.csv` in the selected data
directory uses this format (replace example IDs with real ones):

```text
reaction_id|reagents|catalysts
0|water|platinum
1||
```

An absent row means **requirements unknown**, not \"no catalyst needed.\"
An empty reagent/catalyst field on a present row means *explicitly none in
this teaching metadata*. Inputs are normalized case-insensitively.

**Important:** The existing curated, Rhea and ORD datasets generally lack
verified structured catalysts. By default, their unannotated reactions are
allowed for DSA routing; `strict` excludes them. The frontend displays the
known-requirement coverage. ChemPath does **not** infer requirements from
the old `conditions` free-text field.

CLI example (empty fields are passed as shell-quoted arguments):

```bash
./engine/build/chempath constrained Methane Bicarbonate 3 "" "" "" "" allow
```

REST: `POST /api/path/constrained`

```json
{
  "source": "Methane",
  "target": "Bicarbonate",
  "k": 3,
  "blockedReactionIds": [10],
  "blockedCompoundIds": [],
  "availableReagents": [],
  "availableCatalysts": [],
  "unknownRequirements": "allow"
}
```

These paths still use the **legacy participation projection**. They are
not multi-reactant feasibility plans. Use the Milestone A `feasible`
mode for explicit all-reactant dependency closure.

## Phase 5: Pareto multi-objective shortest paths

The `MultiObjective` C++ engine maintains a frontier of non-dominated labels
per vertex and reconstructs paths via stable global parent-label IDs.
Exact objective modes:

1. `steps-cost` — minimize reaction steps and illustrative graph weight.
2. `steps-cost-reagents` — also minimize the **sum of annotated reagent
   occurrences per reaction**, excluding records with unknown metadata.

The second mode does not count unique reagents or claim experimental
feasibility. In unannotated datasets the three-objective mode can have no
available route.

To prevent runaway complexity, the engine applies explicit total-label and
per-vertex label caps. Its response has `complete=false` if the search
budget is reached. A returned frontier is **not claimed exact** in that
case. `routesOmitted=true` indicates the presentation output limit cut a
completed or partial frontier.

```bash
./engine/build/chempath pareto Methane Bicarbonate steps-cost 30000 8
```

REST: `GET /api/path/pareto?from=Methane&to=Bicarbonate&objective=steps-cost`

The React **Algorithm Lab** has separate Constraints and Pareto tabs with
explicit limitations and results.

## Complexity and verification

- CSR construction: `O(V+E)` time and graph storage.
- Filtered Dijkstra: `O((V+E) log V)` with the binary heap (typical bound).
- Yen-style K paths: up to `O(K V (E+V log V))` for this simple implementation.
- Pareto label-setting: labels can be **exponential** in the worst case;
  output and computational budgets are explicit.

`test_csr_production.cpp` checks neighbor identity across backends,
cost/reachability equivalence on deterministic curated queries, and binary
round-trips including corrupt-file rejection. `test_milestone_b.cpp`
uses fully synthetic DSA fixtures with three non-dominated routes, resource
filters, known reagent/catalyst requirements, and resource-limit reporting.
HTTP smoke tests cover both new endpoints.

```bash
npm run build:engine
npm run test:engine
node scripts/smoke-api.mjs
npm run build:web
```

Do not present stored Dijkstra edge weights as measured chemistry energy,
yield, hazards or cost.
