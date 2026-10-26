#include "ReactionGraph.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;
using Search = chempath::PathResult (chempath::ReactionGraph::*)(
    const std::string&, const std::string&) const;

struct Algorithm {
    const char* name;
    Search search;
};

std::size_t percentileIndex(std::size_t count, unsigned percentage) {
    return std::min(count - 1, (count - 1) * percentage / 100);
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 3 || argc > 4) {
        std::cerr << "Usage: chempath_bench compounds.csv reactions.csv [samples]\n";
        return 1;
    }

    int samples = 128;
    if (argc == 4) {
        samples = std::atoi(argv[3]);
        if (samples < 1 || samples > 100000) {
            std::cerr << "Samples must be between 1 and 100000.\n";
            return 1;
        }
    }

    chempath::ReactionGraph graph;
    if (!graph.loadFromFiles(argv[1], argv[2])) {
        std::cerr << "Failed to load dataset.\n";
        return 2;
    }

    // Identical, deterministic pairs across all algorithms; warm-up runs are
    // excluded. Timings measure in-memory searches, NOT CLI startup/CSV loads.
    std::vector<std::pair<std::string, std::string>> queries;
    queries.reserve(static_cast<std::size_t>(samples));
    const auto& compounds = graph.compounds();
    for (int i = 0; i < samples; ++i) {
        const auto& from = compounds[
            (static_cast<std::size_t>(i) * 37 + 11) % compounds.size()];
        std::size_t targetId =
            (static_cast<std::size_t>(i) * 83 + 5) % compounds.size();

        // Half the queries stress nontrivial reachable paths (furthest known
        // target); the other half sample the full catalog, including no-path
        // cases. Avoid benchmarking mostly immediate no-path exits.
        if (i % 2 == 0) {
            const auto hops = graph.hopDistances(from.name);
            int bestHops = -1;
            for (std::size_t j = 0; j < hops.size(); ++j) {
                if (hops[j] > bestHops) {
                    bestHops = hops[j];
                    targetId = j;
                }
            }
        }
        queries.emplace_back(from.name, compounds[targetId].name);
    }

    constexpr std::array<Algorithm, 7> algorithms{{
        {"BFS", &chempath::ReactionGraph::shortestPathBfs},
        {"Bidirectional BFS", &chempath::ReactionGraph::shortestPathBidirectional},
        {"Dijkstra", &chempath::ReactionGraph::shortestPathDijkstra},
        {"A*", &chempath::ReactionGraph::shortestPathAStar},
        {"Dial", &chempath::ReactionGraph::shortestPathDial},
        {"Bidirectional Dijkstra", &chempath::ReactionGraph::shortestPathBidirectionalDijkstra},
        {"Pivot-Frontier Hybrid", &chempath::ReactionGraph::shortestPathPivotFrontier}
    }};

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "Graph: " << compounds.size() << " compounds, "
              << graph.edgeCount() << " directed edges; " << samples
              << " fixed source-target pairs.\n";
    std::cout << "Query mix: half farthest reachable, half catalog-wide pairs.\n";
    std::cout << "Timing unit: microseconds, in-memory only (not CSV parsing/process startup).\n";
    std::cout << "Algorithm,p50_us,p95_us,mean_us,avg_visited,found,checksum\n";

    for (const auto& algorithm : algorithms) {
        // Warm CPU caches and avoid first-call effects for short runs.
        for (int i = 0; i < std::min(samples, 8); ++i) {
            (void)(graph.*algorithm.search)(queries[i].first, queries[i].second);
        }

        std::vector<double> timings;
        timings.reserve(queries.size());
        std::size_t visited = 0;
        std::size_t found = 0;
        std::size_t checksum = 0;

        for (const auto& query : queries) {
            const auto start = Clock::now();
            const auto result = (graph.*algorithm.search)(query.first, query.second);
            const auto end = Clock::now();
            timings.push_back(
                std::chrono::duration<double, std::micro>(end - start).count());
            visited += result.visitedOrder.size();
            found += result.found ? 1 : 0;
            // Compare minimum hop count (BFS) or total weight (weighted
            // methods). Equally optimal routes may use different node counts.
            checksum += result.found
                ? static_cast<std::size_t>(result.totalCost)
                : 0;
        }

        std::sort(timings.begin(), timings.end());
        const double mean = std::accumulate(timings.begin(), timings.end(), 0.0)
            / static_cast<double>(timings.size());
        std::cout << algorithm.name << ","
                  << timings[percentileIndex(timings.size(), 50)] << ","
                  << timings[percentileIndex(timings.size(), 95)] << ","
                  << mean << ","
                  << static_cast<double>(visited) / static_cast<double>(samples) << ","
                  << found << ","
                  << checksum << "\n";
    }
}
