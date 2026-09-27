#include "ReactionGraph.hpp"

#include <algorithm>
#include <cassert>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc < 3) {
        std::cerr << "Expected compounds and reactions data paths\n";
        return 1;
    }

    chempath::ReactionGraph graph;
    assert(graph.loadFromFiles(argv[1], argv[2]));

    assert(graph.compounds().size() >= 400);
    assert(graph.reactions().size() >= 650);
    assert(graph.edgeCount() >= 1500);

    const auto bfs = graph.shortestPathBfs("Methane", "Bicarbonate");
    assert(bfs.found);
    assert(bfs.compoundIds.size() >= 4);
    assert(bfs.reactionIds.size() + 1 == bfs.compoundIds.size());
    assert(!bfs.visitedOrder.empty());

    const auto dijkstra = graph.shortestPathDijkstra("Methane", "Bicarbonate");
    assert(dijkstra.found);
    assert(dijkstra.reactionIds.size() + 1 == dijkstra.compoundIds.size());
    assert(dijkstra.totalCost > 0);
    assert(!dijkstra.visitedOrder.empty());

    const auto bidirectional = graph.shortestPathBidirectional("Methane", "Bicarbonate");
    assert(bidirectional.found);
    assert(bidirectional.reactionIds.size() + 1 == bidirectional.compoundIds.size());
    assert(!bidirectional.visitedOrder.empty());

    const auto missingPath = graph.shortestPathBfs("Not A Compound", "Water");
    assert(!missingPath.found);

    const auto reachable = graph.reachableDfs("Methane");
    assert(!reachable.empty());
    const auto methaneId = graph.compoundId("Methane");
    assert(methaneId.has_value());
    assert(std::find(reachable.begin(), reachable.end(), *methaneId) != reachable.end());

    const auto matches = graph.searchCompounds("meth");
    assert(matches.size() >= 3);

    const auto cycle = graph.firstDirectedCycle();
    assert(!cycle.empty());
    assert(cycle.front() == cycle.back());

    const auto scc = graph.stronglyConnectedComponents();
    assert(!scc.components.empty());
    assert(!scc.visitedOrder.empty());

    std::cout
        << "All ChemPath engine tests passed: "
        << graph.compounds().size() << " compounds, "
        << graph.reactions().size() << " reactions, "
        << graph.edgeCount() << " directed edges.\n";
    return 0;
}
