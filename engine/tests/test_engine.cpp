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
    assert(graph.compounds().size() >= 1300);
    assert(graph.reactions().size() >= 1600);
    assert(graph.edgeCount() >= 3000);

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
    assert(bfs.compoundIds.size() >= 2);
    assert(bfs.reactionIds.size() + 1 == bfs.compoundIds.size());
    assert(graph.compound(bfs.compoundIds.front())->name == "Methane");
    assert(graph.compound(bfs.compoundIds.back())->name == "Bicarbonate");
    assert(!bfs.visitedOrder.empty());

    // Co-reactants must not become independent reaction-entry vertices.
    // In H2CO3 + H2O ⇌ H3O+ + HCO3-, water is a co-reactant, so there
    // must be no compound-graph shortcut Water -> Bicarbonate.
    const auto waterId = graph.compoundId("Water");
    const auto bicarbonateId = graph.compoundId("Bicarbonate");
    assert(waterId.has_value());
    assert(bicarbonateId.has_value());

    bool hasFalseWaterShortcut = false;
    for (const auto& edge : graph.adjacency()[*waterId]) {
        if (edge.to == *bicarbonateId) {
            hasFalseWaterShortcut = true;
            break;
        }
    }
    assert(!hasFalseWaterShortcut);

    const auto dijkstra = graph.shortestPathDijkstra("Methane", "Bicarbonate");
    assert(dijkstra.found);
    assert(dijkstra.reactionIds.size() + 1 == dijkstra.compoundIds.size());
    assert(dijkstra.totalCost > 0);
    assert(!dijkstra.visitedOrder.empty());

    const auto astar = graph.shortestPathAStar("Methane", "Bicarbonate");
    assert(astar.found);
    assert(astar.totalCost == dijkstra.totalCost);
    assert(astar.reactionIds.size() + 1 == astar.compoundIds.size());

    const auto dial = graph.shortestPathDial("Methane", "Bicarbonate");
    assert(dial.found);
    assert(dial.totalCost == dijkstra.totalCost);
    assert(dial.reactionIds.size() + 1 == dial.compoundIds.size());

    const auto bellmanFord = graph.shortestPathBellmanFord("Methane", "Bicarbonate");
    assert(bellmanFord.found);
    assert(bellmanFord.totalCost == dijkstra.totalCost);
    assert(bellmanFord.reactionIds.size() + 1 == bellmanFord.compoundIds.size());

    const auto bidirectionalDijkstra =
        graph.shortestPathBidirectionalDijkstra("Methane", "Bicarbonate");
    assert(bidirectionalDijkstra.found);
    assert(bidirectionalDijkstra.totalCost == dijkstra.totalCost);
    assert(bidirectionalDijkstra.reactionIds.size() + 1 ==
           bidirectionalDijkstra.compoundIds.size());

    const auto pivotFrontier =
        graph.shortestPathPivotFrontier("Methane", "Bicarbonate");
    assert(pivotFrontier.found);
    assert(pivotFrontier.totalCost == dijkstra.totalCost);
    assert(pivotFrontier.reactionIds.size() + 1 == pivotFrontier.compoundIds.size());

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
