# ChemPath

**ChemPath** is an interactive chemical reaction-network explorer built as a Data Structures course project. The browser renders a dense directed network, while the graph algorithms and data-structure logic execute in a **C++17 engine**.

> **Current audited build:** 235 compounds, 249 curated reaction records and 464 directed compound-projection edges. The network is deliberately capped for smooth interactive layout while preserving representative inorganic, organic, biochemical, salt, acid-base, peptide and precipitation chemistry.

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


## Performance-focused dataset

The earlier 1,337-compound build was useful for stress testing but was too large for a classroom visualization: Cytoscape layout became expensive and a large fraction of the nodes were repetitive long-chain homologues or peptide combinations.

The interactive build is now intentionally curated to **235 compounds / 249 reactions / 464 directed edges**. It keeps representative C1-C6 organic families, core inorganic and acid-base chemistry, common biochemical compounds, important aromatic examples, solubility/precipitation chemistry, and a 6×6 representative dipeptide subset.

For pathfinding mode, ChemPath asks the C++ DFS reachability endpoint whenever the start compound changes. The target selector then shows only compounds that are actually reachable from that source, avoiding misleading "no path" selections while keeping the graph algorithms in C++.
