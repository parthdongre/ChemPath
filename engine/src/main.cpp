#include "ReactionGraph.hpp"
#include "Lab.hpp"

#include <chrono>
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using chempath::PathResult;
using chempath::ReactionGraph;
namespace lab = chempath::lab;

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
                << ",\"reversible\":" << (reaction&&reaction->reversible?"true":"false")
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

void printRoute(const ReactionGraph& graph, const PathResult& result, int simulatedCost = 0) {
    std::cout << "{\"found\":" << (result.found?"true":"false")
              << ",\"totalCost\":" << result.totalCost
              << ",\"steps\":" << result.reactionIds.size()
              << ",\"path\":";
    printCompoundArray(graph, result.compoundIds);
    std::cout << ",\"reactionPath\":[";
    for(std::size_t i=0;i<result.reactionIds.size();++i){
        if(i)std::cout << ",";
        const auto* r=graph.reaction(result.reactionIds[i]);
        std::cout << "{\"reactionId\":" << result.reactionIds[i]
                  << ",\"reaction\":\"" << jsonEscape(r?r->name:(result.reactionIds[i]==-2?"Hypothetical graph edge":""))
                  << "\",\"equation\":\"" << jsonEscape(r?r->equation:(result.reactionIds[i]==-2?"Sandbox only; not a chemical reaction":""))
                  << "\",\"conditions\":\"" << jsonEscape(r?r->conditions:(result.reactionIds[i]==-2?"Hypothetical directed edge; dataset unchanged":""))
                  << "\",\"reversible\":" << (r&&r->reversible?"true":"false")
                  << ",\"cost\":" << (r?r->cost:simulatedCost)
                  << ",\"sourceKey\":\"" << jsonEscape(r?r->sourceKey:(result.reactionIds[i]==-2?"SANDBOX":""))
                  << "\"}";
    }
    std::cout << "]}";
}

void printTrace(const ReactionGraph& graph,const lab::Trace& trace) {
    std::cout << "{\"ok\":true,\"truncated\":" << (trace.truncated?"true":"false")
              << ",\"events\":[";
    for(std::size_t i=0;i<trace.events.size();++i){
        const auto& e=trace.events[i];
        if(i)std::cout << ",";
        std::cout << "{\"type\":\"" << jsonEscape(e.type)
                  << "\",\"node\":" << e.node
                  << ",\"from\":" << e.from
                  << ",\"to\":" << e.to
                  << ",\"distance\":" << e.distance
                  << ",\"lowLink\":" << e.lowLink
                  << ",\"frontier\":[";
        for(std::size_t j=0;j<e.frontier.size();++j){
            if(j)std::cout << ",";
            std::cout << "[" << e.frontier[j].first << "," << e.frontier[j].second << "]";
        }
        std::cout << "]}";
    }
    std::cout << "],\"route\":";
    printRoute(graph,trace.path);
    std::cout << "}\n";
}

std::vector<std::string> splitProtocol(const std::string& line){
    std::vector<std::string> args;
    std::string part;
    std::istringstream stream(line);
    while(std::getline(stream,part,'\t'))args.push_back(part);
    return args;
}
} // namespace

int runCommand(const ReactionGraph& graph,const std::vector<std::string>& args) {
    if(args.empty()){printError("Command required");return 1;}
    const std::string command = args[0];

    if(command=="labtrace"){
        if(args.size()<3){printError("labtrace requires algorithm and source");return 1;}
        const std::string algo=args[1];
        const auto trace=algo=="tarjan"
            ? lab::traceTarjan(graph)
            : lab::trace(graph,algo,args[2],args.size()>3?args[3]:"");
        if(algo!="tarjan" && algo!="bfs" && algo!="dfs" && algo!="dijkstra"){
            printError("Trace supports bfs, dfs, dijkstra, tarjan");return 1;
        }
        printTrace(graph,trace);return 0;
    }

    if(command=="labcomponents"){
        const auto summary=lab::components(graph);
        std::cout << "{\"ok\":true,\"weakCount\":" << summary.weakCount
                  << ",\"weakComponent\":[";
        for(std::size_t i=0;i<summary.weakComponent.size();++i){
            if(i)std::cout << ",";
            std::cout << summary.weakComponent[i];
        }
        std::cout << "],\"components\":[";
        for(std::size_t i=0;i<summary.components.size();++i){
            if(i)std::cout << ",";
            std::cout << "[";
            for(std::size_t j=0;j<summary.components[i].size();++j){
                if(j)std::cout << ",";
                std::cout << summary.components[i][j];
            }
            std::cout << "]";
        }
        std::cout << "],\"dagEdges\":[";
        for(std::size_t i=0;i<summary.dagEdges.size();++i){
            if(i)std::cout << ",";
            std::cout << "[" << summary.dagEdges[i].first << ","
                      << summary.dagEdges[i].second << "]";
        }
        std::cout << "],\"topological\":[";
        for(std::size_t i=0;i<summary.topological.size();++i){
            if(i)std::cout << ",";
            std::cout << summary.topological[i];
        }
        std::cout << "]}\n";return 0;
    }

    if(command=="labkpaths"){
        if(args.size()<3){printError("labkpaths requires from,to");return 1;}
        std::size_t k=3;
        if(args.size()>3){
            try{k=static_cast<std::size_t>(std::stoul(args[3]));}
            catch(...){printError("Invalid k");return 1;}
        }
        if(k<1 || k>10){printError("k must be 1-10");return 1;}
        const auto paths=lab::kShortest(graph,args[1],args[2],k);
        std::cout << "{\"ok\":true,\"routes\":[";
        for(std::size_t i=0;i<paths.size();++i){
            if(i)std::cout << ",";
            printRoute(graph,paths[i]);
        }
        std::cout << "]}\n";return 0;
    }

    if(command=="labedit"){
        if(args.size()<8){printError("labedit requires from to mode edgeFrom edgeTo reactionId weight");return 1;}
        const auto mode=args[3];
        if(mode!="add" && mode!="replace"){printError("labedit mode must be add or replace");return 1;}
        try{
            const int a=std::stoi(args[4]),b=std::stoi(args[5]);
            const int reaction=std::stoi(args[6]),weight=std::stoi(args[7]);
            const auto result=lab::withEdge(graph,args[1],args[2],a,b,reaction,weight,mode=="replace");
            std::cout << "{\"ok\":true,\"mode\":\"" << mode << "\",\"route\":";
            printRoute(graph,result,weight);
            std::cout << "}\n";
        }catch(...){printError("Invalid hypothetical edge parameters");return 1;}
        return 0;
    }

    if(command=="labplayground"){
        if(args.size()<6){printError("labplayground requires source target edgeFrom edgeTo reactionId");return 1;}
        try{
            const auto result=lab::withoutEdge(graph,args[1],args[2],
                               std::stoi(args[3]),std::stoi(args[4]),std::stoi(args[5]));
            std::cout << "{\"ok\":true,\"route\":";
            printRoute(graph,result);
            std::cout << "}\n";
        }catch(...){printError("Invalid edge identifiers");return 1;}
        return 0;
    }

    if(command=="labcsr"){
        int iterations=300;
        if(args.size()>1)try{iterations=std::stoi(args[1]);}catch(...){printError("Invalid iterations");return 1;}
        const auto r=lab::compareRepresentations(graph,iterations);
        std::cout << "{\"ok\":true,\"nodes\":" << r.nodes << ",\"edges\":" << r.edges
                  << ",\"adjacencyBytes\":" << r.adjacencyBytes
                  << ",\"csrBytes\":" << r.csrBytes
                  << ",\"adjacencyUs\":" << r.adjacencyUs
                  << ",\"csrUs\":" << r.csrUs
                  << ",\"reached\":" << r.reached << "}\n";return 0;
    }

    if(command=="labsynthetic"){
        if(args.size()<4){printError("labsynthetic requires nodes edges seed");return 1;}
        try{
            const auto r=lab::synthetic(std::stoi(args[1]),std::stoi(args[2]),std::stoi(args[3]));
            std::cout << "{\"ok\":true,\"nodes\":" << r.nodes
                      << ",\"edges\":" << r.edges << ",\"seed\":" << r.seed
                      << ",\"reachable\":" << r.reachable
                      << ",\"shortestHops\":" << r.shortestHops
                      << ",\"weightedCost\":" << r.weightedCost
                      << ",\"bfsUs\":" << r.bfsUs
                      << ",\"dijkstraUs\":" << r.dijkstraUs << "}\n";
        }catch(...){printError("Invalid graph parameters");return 1;}
        return 0;
    }

    if(command=="labcompare"){
        if(args.size()<3){printError("labcompare requires source,target");return 1;}
        std::cout << "{\"ok\":true,\"algorithms\":[";
        const std::vector<std::pair<std::string,PathResult(ReactionGraph::*)(const std::string&,const std::string&) const>> methods={
            {"BFS",&ReactionGraph::shortestPathBfs},
            {"Bidirectional BFS",&ReactionGraph::shortestPathBidirectional},
            {"Dijkstra",&ReactionGraph::shortestPathDijkstra},
            {"A*",&ReactionGraph::shortestPathAStar},
            {"Dial",&ReactionGraph::shortestPathDial},
            {"Bellman-Ford",&ReactionGraph::shortestPathBellmanFord},
            {"Bidirectional Dijkstra",&ReactionGraph::shortestPathBidirectionalDijkstra},
            {"Pivot Frontier",&ReactionGraph::shortestPathPivotFrontier}
        };
        for(std::size_t i=0;i<methods.size();++i){
            if(i)std::cout << ",";
            const auto start=std::chrono::steady_clock::now();
            const auto r=(graph.*methods[i].second)(args[1],args[2]);
            const auto us=std::chrono::duration<double,std::micro>(
                        std::chrono::steady_clock::now()-start).count();
            std::cout << "{\"name\":\"" << jsonEscape(methods[i].first)
                      << "\",\"found\":" << (r.found?"true":"false")
                      << ",\"microseconds\":" << us
                      << ",\"visited\":" << r.visitedOrder.size()
                      << ",\"steps\":" << r.reactionIds.size()
                      << ",\"cost\":" << r.totalCost << "}";
        }
        std::cout << "]}\n";return 0;
    }

    if (command == "stats") {
        std::cout
            << "{\"ok\":true"
            << ",\"compounds\":" << graph.compounds().size()
            << ",\"reactions\":" << graph.reactions().size()
            << ",\"directedEdges\":" << graph.edgeCount()
            << ",\"structures\":[\"Graph\",\"Adjacency List\",\"Queue\",\"Stack\",\"Hash Table\",\"Trie\",\"Priority Queue\",\"Low-link Stack\"]"
            << ",\"algorithms\":[\"BFS\",\"Dijkstra\",\"A*\",\"Dial\",\"Bellman-Ford\",\"Bidirectional BFS\",\"Bidirectional Dijkstra\",\"Duan et al. 2025-inspired Pivot Frontier\",\"DFS\",\"Directed Cycle Detection\",\"Tarjan SCC\",\"Prefix Search\"]"
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

    if (
        command == "path" ||
        command == "dijkstra" ||
        command == "astar" ||
        command == "dial" ||
        command == "bellmanford" ||
        command == "bidirectional" ||
        command == "bidijkstra" ||
        command == "duan2025") {

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
        } else if (command == "astar") {
            result = graph.shortestPathAStar(args[1], args[2]);
            algorithm = "A*";
        } else if (command == "dial") {
            result = graph.shortestPathDial(args[1], args[2]);
            algorithm = "Dial";
        } else if (command == "bellmanford") {
            result = graph.shortestPathBellmanFord(args[1], args[2]);
            algorithm = "Bellman-Ford";
        } else if (command == "bidirectional") {
            result = graph.shortestPathBidirectional(args[1], args[2]);
            algorithm = "Bidirectional BFS";
        } else if (command == "bidijkstra") {
            result = graph.shortestPathBidirectionalDijkstra(args[1], args[2]);
            algorithm = "Bidirectional Dijkstra";
        } else if (command == "duan2025") {
            result = graph.shortestPathPivotFrontier(args[1], args[2]);
            algorithm = "Pivot-Frontier Hybrid (Duan et al. 2025-inspired)";
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
        const auto distances = graph.hopDistances(args[1]);
        const auto elapsed = std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now() - started).count();

        std::cout << "{\"ok\":true,\"algorithm\":\"DFS + BFS hop index\",\"from\":\""
                  << jsonEscape(args[1]) << "\",\"reachable\":";
        printCompoundArray(graph, order);
        std::cout << ",\"visitedOrder\":";
        printCompoundArray(graph, order);
        std::cout << ",\"distances\":[";

        bool firstDistance = true;
        for (std::size_t id = 0; id < distances.size(); ++id) {
            if (distances[id] < 0) continue;

            const auto* compound = graph.compound(static_cast<int>(id));
            if (!compound) continue;

            if (!firstDistance) std::cout << ",";
            firstDistance = false;

            std::cout << "{\"id\":" << compound->id
                      << ",\"name\":\"" << jsonEscape(compound->name)
                      << "\",\"formula\":\"" << jsonEscape(compound->formula)
                      << "\",\"category\":\"" << jsonEscape(compound->category)
                      << "\",\"hops\":" << distances[id]
                      << "}";
        }

        std::cout << "]"
                  << ",\"count\":" << order.size()
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

int main(int argc,char** argv){
    const auto args=positionalArgs(argc,argv);
    if(args.empty()){
        printError("Usage: chempath <command> [args] [--data dir]");return 1;
    }
    ReactionGraph graph;
    const std::string dir=dataPathFromArgs(argc,argv);
    if(!graph.loadFromFiles(dir+"/compounds.csv",dir+"/reactions.csv")){
        printError("Could not load ChemPath dataset from "+dir);return 2;
    }
    if(args[0]=="serve"){
        std::string line;
        while(std::getline(std::cin,line)){
            try{
                runCommand(graph,splitProtocol(line));
            }catch(const std::exception& ex){
                printError(std::string("Engine request failed: ")+ex.what());
            }
            std::cout.flush();
        }
        return 0;
    }
    return runCommand(graph,args);
}
