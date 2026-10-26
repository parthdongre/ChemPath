#pragma once
#include "ReactionGraph.hpp"
#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace chempath::lab {

struct Event {
    std::string type;
    int node{-1};
    int from{-1};
    int to{-1};
    int distance{-1};
    int lowLink{-1};
    std::vector<std::pair<int, int>> frontier;
};
struct Trace {
    std::vector<Event> events;
    PathResult path;
    bool truncated{false};
};
struct ComponentGraph {
    std::vector<std::vector<int>> components;
    std::vector<std::pair<int, int>> dagEdges;
    std::vector<int> topological;
    std::vector<int> weakComponent;
    int weakCount{0};
};
struct RepresentationStats {
    std::size_t nodes{};
    std::size_t edges{};
    std::size_t adjacencyBytes{};
    std::size_t csrBytes{};
    double adjacencyUs{};
    double csrUs{};
    std::size_t reached{};
};
struct SyntheticStats {
    int nodes{};
    int edges{};
    int seed{};
    int reachable{};
    int shortestHops{-1};
    int weightedCost{-1};
    double bfsUs{};
    double dijkstraUs{};
};

Trace trace(const ReactionGraph& graph, const std::string& algorithm,
            const std::string& from, const std::string& to,
            std::size_t maxEvents = 1200);
Trace traceTarjan(const ReactionGraph& graph, std::size_t maxEvents = 1500);
ComponentGraph components(const ReactionGraph& graph);
std::vector<PathResult> kShortest(const ReactionGraph& graph, const std::string& from,
                                  const std::string& to, std::size_t k = 3);
PathResult withoutEdge(const ReactionGraph& graph, const std::string& from,
                       const std::string& to, int source, int target, int reactionId);
RepresentationStats compareRepresentations(const ReactionGraph& graph, int iterations = 1000);
SyntheticStats synthetic(int nodes, int edges, int seed);
} // namespace chempath::lab
