#include "OrdGraphProvider.hpp"
#include <sqlite3.h>
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <memory>
#include <queue>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
#if defined(__unix__) || defined(__APPLE__)
#include <sys/resource.h>
#endif

namespace {
using Clock=std::chrono::steady_clock;
using Graph=std::unordered_map<std::string,std::vector<std::string>>;

std::size_t peakResidentKiB() {
#if defined(__unix__) || defined(__APPLE__)
    rusage used{};
    if(getrusage(RUSAGE_SELF,&used)!=0)return 0;
#ifdef __APPLE__
    return static_cast<std::size_t>(used.ru_maxrss)/1024; // macOS bytes
#else
    return static_cast<std::size_t>(used.ru_maxrss);      // Linux KiB
#endif
#else
    return 0;
#endif
}
std::string csv(const std::string& text) {
    if(text.find_first_of(",\"\r\n")==std::string::npos)return text;
    std::string quoted="\"";
    for(char ch:text) {if(ch=='\"')quoted.push_back('\"');quoted.push_back(ch);}
    return quoted+"\"";
}
Graph eagerLoad(const std::string& filename) {
    sqlite3* db=nullptr;
    if(sqlite3_open_v2(filename.c_str(),&db,SQLITE_OPEN_READONLY,nullptr)!=SQLITE_OK)
        throw std::runtime_error("Could not open SQLite ORD benchmark database");
    const char* sql="SELECT p.smiles,q.smiles FROM ord_participants p "
                    "JOIN ord_participants q ON p.reaction_id=q.reaction_id "
                    "WHERE p.role='reactant' AND q.role='product'";
    sqlite3_stmt* statement=nullptr;
    if(sqlite3_prepare_v2(db,sql,-1,&statement,nullptr)!=SQLITE_OK) {
        sqlite3_close(db);throw std::runtime_error("Could not materialize graph");
    }
    Graph graph;
    std::size_t links=0;
    while(sqlite3_step(statement)==SQLITE_ROW) {
        if(++links>1000000) {
            sqlite3_finalize(statement);sqlite3_close(db);
            throw std::runtime_error("Eager comparison limited to 1M fixture edges");
        }
        const auto* a=reinterpret_cast<const char*>(sqlite3_column_text(statement,0));
        const auto* b=reinterpret_cast<const char*>(sqlite3_column_text(statement,1));
        if(a && b)graph[a].emplace_back(b);
    }
    sqlite3_finalize(statement);sqlite3_close(db);
    return graph;
}
struct EagerResult {
    bool found{false};
    int hops{-1};
    std::size_t expanded{0};
    std::size_t visited{0};
};
EagerResult search(const Graph& graph,const std::string& from,const std::string& to) {
    EagerResult result;
    if(from==to) {result.found=true;result.hops=0;result.visited=1;return result;}
    std::unordered_map<std::string,int> distance;
    std::queue<std::string> queue;
    distance[from]=0;queue.push(from);
    while(!queue.empty()) {
        auto current=queue.front();queue.pop();++result.expanded;
        auto it=graph.find(current);
        if(it==graph.end())continue;
        for(const auto& next:it->second) {
            if(distance.count(next))continue;
            int hops=distance[current]+1;
            distance.emplace(next,hops);
            if(next==to) {
                result.found=true;result.hops=hops;
                result.visited=distance.size();
                return result;
            }
            queue.push(next);
        }
    }
    result.visited=distance.size();
    return result;
}

std::vector<std::pair<std::string,std::string>> readQueries(const std::string& path) {
    std::ifstream in(path);
    if(!in)throw std::runtime_error("Cannot read benchmark query fixture");
    std::vector<std::pair<std::string,std::string>> pairs;
    std::string row;
    while(std::getline(in,row)) {
        if(row.empty() || row.front()=='#')continue;
        const auto split=row.find('\t');
        if(split==std::string::npos)throw std::runtime_error("Expected tab-delimited query pair");
        pairs.emplace_back(row.substr(0,split),row.substr(split+1));
    }
    if(pairs.empty() || pairs.size()>300)
        throw std::runtime_error("Require 1..300 deterministic query pairs");
    return pairs;
}
double ms(Clock::time_point from,Clock::time_point to) {
    return std::chrono::duration<double,std::milli>(to-from).count();
}
}

int main(int argc,char** argv) {
    // Exact same ORD index and deterministic pairs in separate processes:
    // eager (full in-memory), lazy (persistent cached), cold (fresh provider).
    if(argc!=5) {
        std::cerr<<"Usage: chempath_ord_bench db.sqlite queries.tsv eager|lazy|cold repetitions\n";
        return 2;
    }
    try {
        const std::string dbPath=argv[1],mode=argv[3];
        const int repetitions=std::stoi(argv[4]);
        if((mode!="eager" && mode!="lazy" && mode!="cold") ||
           repetitions<1 || repetitions>12)
            throw std::invalid_argument("Invalid benchmark mode/repetition count");
        const auto queries=readQueries(argv[2]);
        const auto setupStart=Clock::now();
        Graph graph;
        std::unique_ptr<chempath::OrdGraphProvider> provider;
        if(mode=="eager")graph=eagerLoad(dbPath);
        if(mode=="lazy")provider=std::make_unique<chempath::OrdGraphProvider>(dbPath);
        const double setupMs=ms(setupStart,Clock::now());
        std::cout<<std::fixed<<std::setprecision(4);
        std::cout<<"# mode="<<mode<<"\n"
                 <<"# initialization_ms="<<setupMs<<"\n"
                 <<"# query_count="<<queries.size()<<"\n";
        std::cout<<"mode,round,source,target,latency_ms,found,complete,hops,"
                    "expanded,visited,sqlite_queries,cache_hits,cache_misses,"
                    "cache_bytes\n";
        for(int round=0;round<repetitions;++round) {
            for(const auto& [from,to]:queries) {
                const auto started=Clock::now();
                bool found=false,complete=true;
                int hops=-1;
                std::size_t expanded=0,visited=0,sqlQueries=0,hits=0,misses=0,bytes=0;
                if(mode=="eager") {
                    const auto r=search(graph,from,to);
                    found=r.found;hops=r.hops;expanded=r.expanded;visited=r.visited;
                } else {
                    std::unique_ptr<chempath::OrdGraphProvider> transient;
                    chempath::OrdGraphProvider* active=provider.get();
                    if(mode=="cold") {
                        transient=std::make_unique<chempath::OrdGraphProvider>(dbPath);
                        active=transient.get();
                    }
                    chempath::OrdSearchOptions options;
                    options.maxExpanded=20000;
                    options.maxVisited=50000;
                    const auto r=active->shortestPath(from,to,options);
                    found=r.found;complete=r.complete;
                    hops=found?static_cast<int>(r.steps.size()):-1;
                    expanded=r.expanded;visited=r.visited;
                    sqlQueries=r.sqlQueries;hits=r.cacheHits;
                    misses=r.cacheMisses;bytes=r.cachedBytes;
                }
                const auto elapsed=ms(started,Clock::now());
                std::cout<<mode<<","<<round<<","<<csv(from)<<","<<csv(to)<<","
                         <<elapsed<<","<<(found?1:0)<<","<<(complete?1:0)<<","
                         <<hops<<","<<expanded<<","<<visited<<","
                         <<sqlQueries<<","<<hits<<","<<misses<<","<<bytes<<"\n";
            }
        }
        std::cout<<"# peak_rss_kib="<<peakResidentKiB()<<"\n";
    } catch(const std::exception& ex) {
        std::cerr<<"Benchmark failed: "<<ex.what()<<"\n";
        return 1;
    }
}
