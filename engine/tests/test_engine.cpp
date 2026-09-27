#include "ReactionGraph.hpp"

#include <algorithm>
#include <cassert>
#include <iostream>
#include <string>

namespace {

const chempath::Reaction* findReaction(
    const chempath::ReactionGraph& graph,
    const std::string& name) {

    for (const auto& reaction : graph.reactions()) {
        if (reaction.name == name) return &reaction;
    }
    return nullptr;
}

bool reactionHasProduct(
    const chempath::ReactionGraph& graph,
    const chempath::Reaction& reaction,
    const std::string& productName) {

    for (int id : reaction.products) {
        const auto* compound = graph.compound(id);
        if (compound && compound->name == productName) return true;
    }
    return false;
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 3) {
        std::cerr << "Expected compounds and reactions data paths\n";
        return 1;
    }

    chempath::ReactionGraph graph;
    assert(graph.loadFromFiles(argv[1], argv[2]));

    // Dense enough to remain an impressive DSA graph after chemistry cleanup.
    assert(graph.compounds().size() >= 500);
    assert(graph.reactions().size() >= 500);
    assert(graph.edgeCount() >= 1800);

    // Every audited reaction must carry chemistry metadata.
    for (const auto& reaction : graph.reactions()) {
        assert(!reaction.equation.empty());
        assert(!reaction.conditions.empty());
        assert(!reaction.sourceKey.empty());
        assert(reaction.cost > 0);
    }

    // Regression checks for chemistry errors that existed in the earlier dense build.
    const auto* methylamine = findReaction(graph, "Methylamine proton transfer with water");
    assert(methylamine != nullptr);
    assert(reactionHasProduct(graph, *methylamine, "Methylammonium"));
    assert(!reactionHasProduct(graph, *methylamine, "Ammonium"));

    const auto* benzaldehyde = findReaction(graph, "Benzaldehyde reduction");
    assert(benzaldehyde != nullptr);
    assert(reactionHasProduct(graph, *benzaldehyde, "Benzyl Alcohol"));
    assert(!reactionHasProduct(graph, *benzaldehyde, "Benzene"));

    const auto* sulfuric = findReaction(graph, "Sulfuric acid first ionization");
    assert(sulfuric != nullptr);
    assert(reactionHasProduct(graph, *sulfuric, "Hydrogen Sulfate"));

    const auto* nitrile = findReaction(graph, "Acetonitrile acidic hydrolysis");
    assert(nitrile != nullptr);
    assert(reactionHasProduct(graph, *nitrile, "Acetic Acid"));
    assert(reactionHasProduct(graph, *nitrile, "Ammonium Chloride"));

    // Core DSA behavior still works on the audited network.
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
        << "All ChemPath engine + chemistry-audit tests passed: "
        << graph.compounds().size() << " compounds, "
        << graph.reactions().size() << " audited reactions, "
        << graph.edgeCount() << " directed edges.\n";

    return 0;
}
