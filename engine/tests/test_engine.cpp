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
    assert(graph.compounds().size() >= 30);
    assert(graph.reactions().size() >= 30);
    assert(graph.edgeCount() > graph.reactions().size());

    const auto path = graph.shortestPathBfs("Methane", "Bicarbonate");
    assert(path.found);
    assert(path.compoundIds.size() >= 4);
    assert(path.reactionIds.size() + 1 == path.compoundIds.size());

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

    std::cout << "All ChemPath engine tests passed.\n";
    return 0;
}
