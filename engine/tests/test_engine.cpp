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

    // Mid-semester build: large enough to demonstrate graph algorithms,
    // intentionally capped for a smooth classroom visualization.
    assert(graph.compounds().size() >= 650);
    assert(graph.compounds().size() <= 725);
    assert(graph.reactions().size() >= 850);
    assert(graph.reactions().size() <= 900);
    assert(graph.edgeCount() >= 2800);
    assert(graph.edgeCount() <= 3300);

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

    const auto methylOctanoate = graph.compoundId("Methyl Octanoate");
    assert(methylOctanoate.has_value());

    const auto esterPath =
        graph.shortestPathBfs("Octanoic Acid", "Methyl Octanoate");
    assert(esterPath.found);
    assert(esterPath.reactionIds.size() == 1);

    // Core DSA behavior still works on the audited network.
    const auto bfs = graph.shortestPathBfs("Methane", "Bicarbonate");
    assert(bfs.found);
    assert(bfs.compoundIds.size() >= 2);
    assert(bfs.reactionIds.size() + 1 == bfs.compoundIds.size());
    assert(graph.compound(bfs.compoundIds.front())->name == "Methane");
    assert(graph.compound(bfs.compoundIds.back())->name == "Bicarbonate");
    assert(!bfs.visitedOrder.empty());

    // Participation graph semantics: every listed reactant can initiate the
    // compound-level edge when the other required co-reactants are assumed available.
    const auto waterId = graph.compoundId("Water");
    const auto bicarbonateId = graph.compoundId("Bicarbonate");
    assert(waterId.has_value());
    assert(bicarbonateId.has_value());

    bool hasWaterParticipationEdge = false;
    for (const auto& edge : graph.adjacency()[*waterId]) {
        if (edge.to == *bicarbonateId) {
            hasWaterParticipationEdge = true;
            break;
        }
    }
    assert(hasWaterParticipationEdge);

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

    // Cross-network path: an apparently unrelated inorganic target can still be
    // reachable through legitimate reaction products/byproducts.
    const auto octeneToSo2 = graph.shortestPathBfs("Oct-1-ene", "Sulfur Dioxide");
    assert(octeneToSo2.found);
    assert(graph.compound(octeneToSo2.compoundIds.front())->name == "Oct-1-ene");
    assert(graph.compound(octeneToSo2.compoundIds.back())->name == "Sulfur Dioxide");

    const auto octeneDistances = graph.hopDistances("Oct-1-ene");
    const auto sulfurDioxideId = graph.compoundId("Sulfur Dioxide");
    assert(sulfurDioxideId.has_value());
    assert(octeneDistances[*sulfurDioxideId] >= 0);

    const auto carbonicToNo2 =
        graph.shortestPathBfs("Carbonic Acid", "Nitrogen Dioxide");
    assert(carbonicToNo2.found);
    assert(carbonicToNo2.reactionIds.size() >= 2);

    const auto carbonicDistances = graph.hopDistances("Carbonic Acid");
    const auto nitrogenDioxideId = graph.compoundId("Nitrogen Dioxide");
    const auto eicosanolId = graph.compoundId("Eicosan-1-ol");
    assert(nitrogenDioxideId.has_value());
    assert(eicosanolId.has_value());
    assert(carbonicDistances[*nitrogenDioxideId] >= 0);
    assert(carbonicDistances[*eicosanolId] >= 0);

    const auto ammoniumToNo2 =
        graph.shortestPathBfs("Ammonium Chloride", "Nitrogen Dioxide");
    assert(ammoniumToNo2.found);
    assert(ammoniumToNo2.reactionIds.size() <= 6);

    const auto ammoniumAStar =
        graph.shortestPathAStar("Ammonium Chloride", "Nitrogen Dioxide");
    assert(ammoniumAStar.found);

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
