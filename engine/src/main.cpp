#include "ReactionGraph.hpp"

#include <chrono>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using chempath::PathResult;
using chempath::ReactionGraph;

namespace {

std::string jsonEscape(const std::string& value) {
    std::ostringstream out;
    for (unsigned char ch : value) {
        switch (ch) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (ch < 0x20) {
                    out << "\\u"
                        << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(ch)
                        << std::dec;
                } else {
                    out << static_cast<char>(ch);
                }
        }
    }
    return out.str();
}

void printCompoundArray(const ReactionGraph& graph, const std::vector<int>& ids) {
    std::cout << "[";
    bool first = true;
    for (int id : ids) {
        const auto* compound = graph.compound(id);
        if (!compound) continue;
        if (!first) std::cout << ",";
        first = false;
        std::cout
            << "{\"id\":" << compound->id
            << ",\"name\":\"" << jsonEscape(compound->name)
            << "\",\"formula\":\"" << jsonEscape(compound->formula)
            << "\",\"category\":\"" << jsonEscape(compound->category)
            << "\"}";
    }
    std::cout << "]";
}

void printError(const std::string& message) {
    std::cout << "{\"ok\":false,\"error\":\"" << jsonEscape(message) << "\"}\n";
}

std::string dataPathFromArgs(int argc, char** argv) {
    for (int i = 1; i + 1 < argc; ++i) {
        if (std::string(argv[i]) == "--data") return argv[i + 1];
    }

    if (const char* env = std::getenv("CHEMPATH_DATA_DIR")) {
        return env;
    }
    return "data";
}

std::vector<std::string> positionalArgs(int argc, char** argv) {
    std::vector<std::string> args;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--data") {
            ++i;
            continue;
        }
        args.emplace_back(argv[i]);
    }
    return args;
}

void printPathResult(
    const ReactionGraph& graph,
    const PathResult& result,
    const std::string& algorithm,
    const std::string& from,
    const std::string& to,
    double elapsedMs) {

    std::cout << "{\"ok\":true,\"algorithm\":\"" << jsonEscape(algorithm)
              << "\",\"found\":" << (result.found ? "true" : "false")
              << ",\"from\":\"" << jsonEscape(from)
              << "\",\"to\":\"" << jsonEscape(to) << "\"";

    if (result.found) {
        std::cout << ",\"path\":";
        printCompoundArray(graph, result.compoundIds);

        std::cout << ",\"reactionPath\":[";
        for (std::size_t i = 0; i < result.reactionIds.size(); ++i) {
            if (i) std::cout << ",";
            const auto* reaction = graph.reaction(result.reactionIds[i]);
            const auto* source = graph.compound(result.compoundIds[i]);
            const auto* target = graph.compound(result.compoundIds[i + 1]);
            std::cout
                << "{\"reactionId\":" << result.reactionIds[i]
                << ",\"reaction\":\"" << jsonEscape(reaction ? reaction->name : "")
                << "\",\"equation\":\"" << jsonEscape(reaction ? reaction->equation : "")
                << "\",\"conditions\":\"" << jsonEscape(reaction ? reaction->conditions : "")
                << "\",\"sourceKey\":\"" << jsonEscape(reaction ? reaction->sourceKey : "")
                << "\",\"cost\":" << (reaction ? reaction->cost : 1)
                << ",\"from\":\"" << jsonEscape(source ? source->name : "")
                << "\",\"to\":\"" << jsonEscape(target ? target->name : "")
                << "\"}";
        }
        std::cout << "]";
    } else {
        std::cout << ",\"path\":[],\"reactionPath\":[]";
    }

    std::cout << ",\"steps\":" << result.reactionIds.size()
              << ",\"totalCost\":" << result.totalCost
              << ",\"visitedCount\":" << result.visitedOrder.size()
              << ",\"visitedOrder\":";
    printCompoundArray(graph, result.visitedOrder);
    std::cout << ",\"elapsedMs\":" << std::fixed << std::setprecision(4) << elapsedMs
              << "}\n";
}

} // namespace

int main(int argc, char** argv) {
    const auto args = positionalArgs(argc, argv);
    if (args.empty()) {
        printError(
            "Usage: chempath <network|path|dijkstra|bidirectional|reachable|cycles|scc|search|stats> [args]");
        return 1;
    }

    ReactionGraph graph;
    const std::string dataDir = dataPathFromArgs(argc, argv);
    if (!graph.loadFromFiles(dataDir + "/compounds.csv", dataDir + "/reactions.csv")) {
        printError("Could not load ChemPath dataset from " + dataDir);
        return 2;
    }

    const std::string command = args[0];

    if (command == "stats") {
        std::cout
            << "{\"ok\":true"
            << ",\"compounds\":" << graph.compounds().size()
            << ",\"reactions\":" << graph.reactions().size()
            << ",\"directedEdges\":" << graph.edgeCount()
            << ",\"structures\":[\"Graph\",\"Adjacency List\",\"Queue\",\"Stack\",\"Hash Table\",\"Trie\",\"Priority Queue\",\"Low-link Stack\"]"
            << ",\"algorithms\":[\"BFS\",\"Dijkstra\",\"Bidirectional BFS\",\"DFS\",\"Directed Cycle Detection\",\"Tarjan SCC\",\"Prefix Search\"]"
            << ",\"chemistryAudit\":\"curated-v1\""
            << "}\n";
        return 0;
    }

    if (command == "network") {
        std::cout << "{\"ok\":true,\"nodes\":[";
        for (std::size_t i = 0; i < graph.compounds().size(); ++i) {
            const auto& c = graph.compounds()[i];
            if (i) std::cout << ",";
            std::cout
                << "{\"id\":" << c.id
                << ",\"name\":\"" << jsonEscape(c.name)
                << "\",\"formula\":\"" << jsonEscape(c.formula)
                << "\",\"category\":\"" << jsonEscape(c.category)
                << "\"}";
        }
        std::cout << "],\"edges\":[";

        bool firstEdge = true;
        for (std::size_t from = 0; from < graph.adjacency().size(); ++from) {
            for (const auto& edge : graph.adjacency()[from]) {
                const auto* reaction = graph.reaction(edge.reactionId);
                if (!reaction) continue;
                if (!firstEdge) std::cout << ",";
                firstEdge = false;
                std::cout
                    << "{\"id\":\"" << from << "-" << edge.to << "-" << edge.reactionId
                    << "\",\"source\":" << from
                    << ",\"target\":" << edge.to
                    << ",\"reactionId\":" << edge.reactionId
                    << ",\"cost\":" << edge.cost
                    << ",\"reaction\":\"" << jsonEscape(reaction->name)
                    << "\",\"equation\":\"" << jsonEscape(reaction->equation)
                    << "\",\"conditions\":\"" << jsonEscape(reaction->conditions)
                    << "\",\"sourceKey\":\"" << jsonEscape(reaction->sourceKey)
                    << "\",\"note\":\"" << jsonEscape(reaction->note)
                    << "\"}";
            }
        }
        std::cout << "]}\n";
        return 0;
    }

    if (command == "path" || command == "dijkstra" || command == "bidirectional") {
        if (args.size() < 3) {
            printError(command + " requires <from> <to>");
            return 1;
        }

        const auto started = std::chrono::steady_clock::now();
        PathResult result;
        std::string algorithm;

        if (command == "dijkstra") {
            result = graph.shortestPathDijkstra(args[1], args[2]);
            algorithm = "Dijkstra";
        } else if (command == "bidirectional") {
            result = graph.shortestPathBidirectional(args[1], args[2]);
            algorithm = "Bidirectional BFS";
        } else {
            result = graph.shortestPathBfs(args[1], args[2]);
            algorithm = "BFS";
        }

        const auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();

        printPathResult(graph, result, algorithm, args[1], args[2], elapsed);
        return 0;
    }

    if (command == "reachable") {
        if (args.size() < 2) {
            printError("reachable requires <from>");
            return 1;
        }

        const auto started = std::chrono::steady_clock::now();
        const auto order = graph.reachableDfs(args[1]);
        const auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();

        std::cout << "{\"ok\":true,\"algorithm\":\"DFS\",\"from\":\""
                  << jsonEscape(args[1]) << "\",\"reachable\":";
        printCompoundArray(graph, order);
        std::cout << ",\"visitedOrder\":";
        printCompoundArray(graph, order);
        std::cout << ",\"count\":" << order.size()
                  << ",\"elapsedMs\":" << std::fixed << std::setprecision(4) << elapsed
                  << "}\n";
        return 0;
    }

    if (command == "cycles") {
        const auto cycle = graph.firstDirectedCycle();
        std::cout << "{\"ok\":true,\"algorithm\":\"DFS recursion-stack cycle detection\""
                  << ",\"hasCycle\":" << (!cycle.empty() ? "true" : "false")
                  << ",\"cycle\":";
        printCompoundArray(graph, cycle);
        std::cout << ",\"visitedOrder\":";
        printCompoundArray(graph, cycle);
        std::cout << "}\n";
        return 0;
    }

    if (command == "scc") {
        const auto started = std::chrono::steady_clock::now();
        const auto result = graph.stronglyConnectedComponents();
        const auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();

        std::cout << "{\"ok\":true,\"algorithm\":\"Tarjan SCC\",\"componentCount\":"
                  << result.components.size()
                  << ",\"visitedOrder\":";
        printCompoundArray(graph, result.visitedOrder);
        std::cout << ",\"components\":[";

        for (std::size_t i = 0; i < result.components.size(); ++i) {
            if (i) std::cout << ",";
            printCompoundArray(graph, result.components[i]);
        }

        std::cout << "],\"largestComponentSize\":"
                  << (result.components.empty() ? 0 : result.components.front().size())
                  << ",\"elapsedMs\":" << std::fixed << std::setprecision(4) << elapsed
                  << "}\n";
        return 0;
    }

    if (command == "search") {
        if (args.size() < 2) {
            printError("search requires <prefix>");
            return 1;
        }

        const auto ids = graph.searchCompounds(args[1], 12);
        std::cout << "{\"ok\":true,\"dataStructure\":\"Trie\",\"query\":\""
                  << jsonEscape(args[1]) << "\",\"matches\":";
        printCompoundArray(graph, ids);
        std::cout << "}\n";
        return 0;
    }

    printError("Unknown command: " + command);
    return 1;
}
