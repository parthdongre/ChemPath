# ChemPath — Mid-Sem Review Copy

This branch is a frozen review snapshot of ChemPath for the mid-semester Data Structures project review.

## What the project is

ChemPath models a curated chemical reaction network as a directed graph:

- **Vertices:** chemical compounds
- **Edges:** known reaction-participation links
- **Engine:** C++17
- **Frontend:** React + Vite + Cytoscape
- **API:** Node/Express

The current review build intentionally uses a curated ~690-compound network for smoother presentation and easier explanation.

## Core Data Structures / Algorithms

- adjacency-list directed graph
- hash maps for compound/reaction lookup
- queue-based BFS
- stack/iterative DFS
- Dijkstra
- A*
- Bellman-Ford
- Dial's algorithm
- bidirectional pathfinding
- directed cycle detection
- strongly connected components
- Trie-based compound search
- parent arrays / path reconstruction

## Important graph assumption

ChemPath is a **reaction-participation graph**, not a laboratory synthesis planner.

When a compound appears as one reactant in a reaction, the other required reagents/conditions are assumed available. This is why the graph can explore cross-domain reaction connectivity without pretending to predict real lab feasibility.

## Run on macOS / Linux

Requirements:
- Node.js 20+
- npm
- CMake 3.16+
- C++17 compiler

From the project root:

```bash
npm install
npm run build:engine
npm run test:engine
npm run dev
```

Then open:

```
http://localhost:5173
```

The API runs on port 8787.

## Useful CLI checks

```bash
./engine/build/chempath stats
./engine/build/chempath path Methane Bicarbonate
./engine/build/chempath reachable Methane
./engine/build/chempath cycles
./engine/build/chempath search meth
```

## Good demo paths

Try these in the web UI:

1. **Methane → Bicarbonate**
2. **Carbonic Acid → Nitrogen Dioxide**
3. **Oct-1-ene → Sulfur Dioxide**

Use BFS first for the simplest explanation, then compare against a weighted path algorithm.

## What I want reviewed

Please focus on:

1. Does the UI make the graph/data-structures concept immediately understandable?
2. Is the pathfinding animation easy to follow?
3. Does compound search feel intuitive?
4. Do any controls or layouts feel confusing?
5. Are there obvious bugs or dead-end selections?
6. Is the visual design too much / too little for a college mid-sem review?
7. Does the project clearly look like a **Data Structures project**, not just a chemistry website?
8. Which 2–3 algorithms are easiest to demonstrate in front of a faculty reviewer?

## Please do not treat this as a chemistry synthesis planner

The chemistry dataset is curated for graph exploration and educational demonstrations. Real synthesis feasibility can depend on stoichiometry, kinetics, competing reactions, catalysts, solvent, temperature, yield, and safety constraints that are outside this project scope.
