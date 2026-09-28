# ChemPath

**ChemPath** is an interactive chemical reaction-network explorer built as a Data Structures course project. The C++17 engine stores and searches the full reaction graph, while the browser renders a focused working set so the catalog can grow without forcing Cytoscape to lay out every compound at once.

> **Current audited build:** 2,898 compounds, 3,350 curated reaction records and about 14,129 directed compound-participation edges. The live Cytoscape view is capped at roughly 620 focused compounds while search, reachability and every C++ algorithm continue to use the full network.

## Core idea

Chemical compounds are represented as graph vertices and documented educational transformations as directed edges. ChemPath lets the user inspect that graph with multiple algorithms while seeing the traversal happen step by step.

The React frontend does **not** implement the algorithms. It requests a result from the C++ engine and then replays the returned visit order over 10 seconds for presentation and learning.

## Algorithms and data structures

| Structure / algorithm | ChemPath usage |
| --- | --- |
| Adjacency-list graph | Stores the curated reaction network |
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

A graph edge means that a documented transformation connects those compounds under the stated conditions. It does not imply that simply mixing the displayed graph nodes will automatically produce the shown product. Catalysts, solvent, temperature, pressure, concentration, selectivity, competing reactions, and laboratory safety are outside this Data Structures project.

The Dijkstra weight is also **not** an activation energy, free-energy change, yield, reaction time, price, or hazard score. It is an illustrative graph weight for demonstrating weighted shortest-path algorithms.

## 10-second algorithm replay

The actual C++ computation usually completes in milliseconds. ChemPath intentionally visualizes the returned traversal for **at least 10 seconds**. Larger visit orders receive proportionally longer replays so individual steps stay visible:

1. the current compound expands,
2. visited compounds remain marked,
3. the camera follows the active vertex,
4. the HUD shows step / visited count / elapsed time,
5. the final solution is fitted into view,
6. final reaction edges display their reaction names,
7. the result panel shows reaction schemes, conditions, reversibility, and source keys.

This means the animation represents the C++ traversal order while still making a fast algorithm understandable during a classroom presentation.

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


## Reaction-to-graph projection

Reaction records may contain several reactants and products, but ChemPath must not interpret every co-reactant as an independent substrate. The compound graph therefore uses the **first listed reactant as the primary substrate**. It creates forward edges from that substrate to the recorded products.

For reversible records, the **first listed product is the designated primary product** and is the only product used to create the reverse edge. Other reactants/products remain visible as chemistry metadata but do not create false entry points. This prevents shortcuts such as treating water in `H2CO3 + H2O ⇌ H3O+ + HCO3-` as though water alone could transform into bicarbonate.


## Scalable catalog + focused rendering

The engine now keeps the **full 2,898-compound catalog**, but the browser does not render all of those nodes simultaneously. The React layer chooses a focused working set of roughly 620 nodes using selected compounds, path/traversal context and high-degree graph hubs. This keeps Cytoscape responsive while preserving the complete graph for C++ algorithms.

The catalog was expanded by restoring the audited C1-C40 families and full ordered dipeptide set, then adding a 40×40 Fischer-ester library. The ester library contributes a large number of legitimate compounds through one well-defined reaction family instead of padding the graph with arbitrary synthetic nodes.

Search is also decoupled from rendering: the picker and directory search all 2,898 compounds, even when a compound is not part of the currently visible Cytoscape subset.


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


## Large-catalog search

Compound selection is optimized for thousands of entries:

- fuzzy matching across compound name, formula and category,
- common aliases such as Ethanoic Acid → Acetic Acid and Methanal → Formaldehyde,
- normalized formula search,
- reachable-target hop counts,
- keyboard navigation with ↑ / ↓ / Enter,
- only the best 220 picker results are mounted at once,
- the full directory loads in pages of 240 cards.

This keeps the search experience fast even as the C++ catalog grows beyond the number of nodes rendered in the graph.


## Reaction participation semantics

ChemPath now projects every listed reactant to every recorded product for a reaction. This means the currently selected compound may participate as a substrate **or as a listed co-reactant/reagent**, while the remaining required reactants are assumed available.

Example:

Ammonium Chloride -> Ammonium -> Ammonia -> Ammonium Docosanoate

The first step is aqueous NH4Cl dissociation; the final step uses the existing Docosanoic Acid + Ammonia ammonium-salt formation record.

This is intentionally a **reaction-participation graph**, not a one-bottle synthesis planner. The UI and viva explanation should state that required co-reactants/conditions are supplied by the reaction record.
