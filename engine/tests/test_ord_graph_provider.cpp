#include "OrdGraphProvider.hpp"

#include <sqlite3.h>
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <queue>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

using chempath::OrdGraphProvider;
using chempath::OrdSearchOptions;
using chempath::OrdPathResult;

static void sql(sqlite3* db, const std::string& command) {
    char* error=nullptr;
    const int rc=sqlite3_exec(db,command.c_str(),nullptr,nullptr,&error);
    if(rc!=SQLITE_OK) {
        const std::string msg=error?error:"SQLite error";
        sqlite3_free(error);
        throw std::runtime_error(msg);
    }
}

static void createFixture(const std::string& filename) {
    sqlite3* db=nullptr;
    if(sqlite3_open(filename.c_str(),&db)!=SQLITE_OK)throw std::runtime_error("create DB");
    sql(db,"CREATE TABLE ord_reactions ("
           "id INTEGER PRIMARY KEY,ord_id TEXT UNIQUE, "
           "reaction_smiles TEXT NOT NULL DEFAULT '',source_file TEXT NOT NULL)");
    sql(db,"CREATE TABLE ord_participants (smiles TEXT NOT NULL,"
           "reaction_id INTEGER NOT NULL,role TEXT NOT NULL,"
           "PRIMARY KEY(smiles,reaction_id,role)) WITHOUT ROWID");
    sql(db,"CREATE INDEX idx_ord_participants_reaction_role_smiles "
           "ON ord_participants(reaction_id,role,smiles)");
    auto add=[&](int id,const std::string& from,const std::string& to) {
        sql(db,"INSERT INTO ord_reactions VALUES("+std::to_string(id)+
               ",'ord-"+std::to_string(id)+"','','fixture')");
        sql(db,"INSERT INTO ord_participants VALUES('"+from+"',"+
               std::to_string(id)+",'reactant')");
        sql(db,"INSERT INTO ord_participants VALUES('"+to+"',"+
               std::to_string(id)+",'product')");
    };
    add(1,"A","B");
    add(2,"B","D");
    add(3,"A","C");
    add(4,"C","D");
    add(5,"X","Y");
    add(6,"D","A"); // cycle
    add(7,"M","P");
    sql(db,"INSERT INTO ord_participants VALUES('N',7,'reactant')");
    sql(db,"INSERT INTO ord_participants VALUES('Q',7,'agent')");
    // High-degree fixture for completeness enforcement.
    for(int i=0;i<6;++i)add(10+i,"G","T"+std::to_string(i));
    sqlite3_close(db);
}

static std::unordered_map<std::string,std::vector<std::string>>
materializeReference(const std::string& filename) {
    sqlite3* db=nullptr;
    assert(sqlite3_open_v2(filename.c_str(),&db,SQLITE_OPEN_READONLY,nullptr)==SQLITE_OK);
    const char* query="SELECT p.smiles,q.smiles "
      "FROM ord_participants p JOIN ord_participants q "
      "ON p.reaction_id=q.reaction_id "
      "WHERE p.role='reactant' AND q.role='product'";
    sqlite3_stmt* stmt=nullptr;
    assert(sqlite3_prepare_v2(db,query,-1,&stmt,nullptr)==SQLITE_OK);
    std::unordered_map<std::string,std::vector<std::string>> graph;
    while(sqlite3_step(stmt)==SQLITE_ROW) {
        const auto* a=reinterpret_cast<const char*>(sqlite3_column_text(stmt,0));
        const auto* b=reinterpret_cast<const char*>(sqlite3_column_text(stmt,1));
        if(a && b)graph[a].push_back(b);
    }
    sqlite3_finalize(stmt);
    sqlite3_close(db);
    return graph;
}
static int referenceDistance(
    const std::unordered_map<std::string,std::vector<std::string>>& graph,
    const std::string& from,const std::string& to) {
    if(from==to)return 0;
    std::queue<std::string> q;
    std::unordered_map<std::string,int> dist;
    dist.emplace(from,0); q.push(from);
    while(!q.empty()) {
        const std::string current=q.front();
        q.pop();
        const auto it=graph.find(current);
        if(it==graph.end())continue;
        for(const auto& next:it->second) {
            if(dist.count(next))continue;
            dist[next]=dist[current]+1;
            if(next==to)return dist[next];
            q.push(next);
        }
    }
    return -1;
}

int main() {
    const auto filename=(std::filesystem::temp_directory_path()/
        ("chempath-ord-mc-"+std::to_string(
        std::chrono::steady_clock::now().time_since_epoch().count())+".sqlite")).string();
    createFixture(filename);
    try {
        OrdGraphProvider provider(filename,4096);
        const auto materialized=materializeReference(filename);
        const std::vector<std::string> sources={"A","B","C","D","X","Y","M","N","P","Q","G","T5","MISSING"};
        for(const auto& from:sources) {
            for(const auto& to:sources) {
                const auto expected=referenceDistance(materialized,from,to);
                const auto actual=provider.shortestPath(from,to);
                assert(actual.complete);
                assert(actual.found==(expected>=0));
                if(actual.found) {
                    assert(actual.steps.size()==static_cast<std::size_t>(expected));
                    assert(actual.compounds.front()==from);
                    assert(actual.compounds.back()==to);
                    assert(actual.compounds.size()==actual.steps.size()+1);
                    for(const auto& step:actual.steps) {
                        assert(!step.ordId.empty());
                        const auto it=materialized.find(step.from);
                        assert(it!=materialized.end());
                        bool has=false;
                        for(const auto& neighbor:it->second)
                            if(neighbor==step.to)has=true;
                        assert(has);
                    }
                }
            }
        }
        // Warm cache is reused across independent C++ queries.
        auto first=provider.shortestPath("A","D");
        auto second=provider.shortestPath("A","D");
        assert(first.found && second.found);
        assert(second.cacheHits>=1);
        assert(second.cachedBytes<=4096);
        assert(provider.cachedBytes()<=4096);
        assert(second.steps.size()==2);

        // All three bounded failure conditions must say INCOMPLETE, not
        // globally unreachable. A->D requires at least two BFS expansions.
        OrdSearchOptions bounded;
        bounded.maxExpanded=1;
        const auto exp=provider.shortestPath("A","D",bounded);
        assert(!exp.found && !exp.complete && exp.limitReason=="maxExpanded");
        bounded=OrdSearchOptions{};
        bounded.maxVisited=2;
        const auto vis=provider.shortestPath("A","D",bounded);
        assert(!vis.found && !vis.complete && vis.limitReason=="maxVisited");
        bounded=OrdSearchOptions{};
        bounded.maxNeighborLinks=3;
        const auto deg=provider.shortestPath("G","T5",bounded);
        assert(!deg.complete && deg.limitReason=="maxNeighborLinks");
        // Agents are not reactants in the participation graph.
        assert(!provider.shortestPath("Q","P").found);
        const auto same=provider.shortestPath("A","A");
        assert(same.found && same.complete && same.steps.empty());
        const auto unknownSame=provider.shortestPath("MISSING","MISSING");
        assert(!unknownSame.found && unknownSame.complete);
        const auto agentSame=provider.shortestPath("Q","Q");
        assert(!agentSame.found && agentSame.complete);

        // Very small LRU budget changes performance only, not answer.
        OrdGraphProvider uncached(filename,1);
        auto withoutCache=uncached.shortestPath("A","D");
        assert(withoutCache.found && withoutCache.steps.size()==2);
        assert(withoutCache.cachedBytes==0);
        bool missing=false;
        try {OrdGraphProvider absent(filename+".missing");}
        catch(const std::runtime_error&){missing=true;}
        assert(missing);
        std::cout<<"ORD indexed BFS, full materialization parity, truncation, "
                    "LRU and error tests passed\n";
    } catch(...) {
        std::filesystem::remove(filename);
        throw;
    }
    std::filesystem::remove(filename);
    return 0;
}
