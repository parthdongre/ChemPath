#include "OrdGraphProvider.hpp"

#include <sqlite3.h>
#include <algorithm>
#include <chrono>
#include <limits>
#include <queue>
#include <stdexcept>
#include <utility>

namespace chempath {
namespace {
void resetStatement(sqlite3_stmt* statement) {
    sqlite3_reset(statement);
    sqlite3_clear_bindings(statement);
}
void sqlCheck(int rc, sqlite3* db, const char* operation) {
    if (rc != SQLITE_OK)
        throw std::runtime_error(std::string(operation) + ": " + sqlite3_errmsg(db));
}
constexpr std::size_t MAX_SMILES = 512;
constexpr std::size_t MAX_PATH_STEPS = 256;
}

OrdGraphProvider::OrdGraphProvider(const std::string& path, std::size_t cacheBudgetBytes)
    : cacheBudgetBytes_(cacheBudgetBytes) {
    if(path.empty()) throw std::invalid_argument("ORD database path is required");
    const int rc=sqlite3_open_v2(path.c_str(), &db_, SQLITE_OPEN_READONLY, nullptr);
    if(rc != SQLITE_OK) {
        const std::string why=db_?sqlite3_errmsg(db_):"SQLite initialization failed";
        if(db_) { sqlite3_close(db_); db_=nullptr; }
        throw std::runtime_error("ORD database unavailable: " + why);
    }
    try {
        sqlite3_busy_timeout(db_,1000);
        sqlCheck(sqlite3_exec(db_,"PRAGMA query_only=ON",nullptr,nullptr,nullptr),db_,
                 "Enable read-only mode");
        // Both lookups are indexed when the ORD reverse participation index
        // (reaction_id,role,smiles) has been created by the import/migration.
        const char* sql =
            "SELECT p.reaction_id, q.smiles "
            "FROM ord_participants AS p "
            "JOIN ord_participants AS q ON q.reaction_id=p.reaction_id "
            "WHERE p.smiles=?1 AND p.role='reactant' AND q.role='product' "
            "ORDER BY p.reaction_id, q.smiles";
        sqlCheck(sqlite3_prepare_v2(db_,sql,-1,&adjacent_,nullptr),db_,
                 "Prepare indexed ORD adjacency");
        sqlCheck(sqlite3_prepare_v2(db_,
                 "SELECT ord_id FROM ord_reactions WHERE id=?1",-1,&lookupId_,nullptr),
                 db_,"Prepare ORD ID lookup");
    } catch (...) {
        if(adjacent_)sqlite3_finalize(adjacent_);
        if(lookupId_)sqlite3_finalize(lookupId_);
        adjacent_=nullptr; lookupId_=nullptr;
        sqlite3_close(db_);
        db_=nullptr;
        throw;
    }
}
OrdGraphProvider::~OrdGraphProvider() {
    if(adjacent_)sqlite3_finalize(adjacent_);
    if(lookupId_)sqlite3_finalize(lookupId_);
    if(db_)sqlite3_close(db_);
}

void OrdGraphProvider::insertCache(const std::string& key,
                                    const std::vector<Neighbor>& neighbors) {
    std::size_t bytes=key.size()+sizeof(CacheEntry);
    for(const auto& item:neighbors) {
        if(item.smiles.size()>std::numeric_limits<std::size_t>::max()-bytes-sizeof(Neighbor))
            return;
        bytes+=sizeof(Neighbor)+item.smiles.size();
    }
    if(bytes>cacheBudgetBytes_)return;
    while(!lru_.empty() && cacheBytes_>cacheBudgetBytes_-bytes) {
        auto last=std::prev(lru_.end());
        const auto it=cache_.find(*last);
        if(it!=cache_.end()) {
            cacheBytes_-=it->second.bytes;
            cache_.erase(it);
        }
        lru_.erase(last);
    }
    lru_.push_front(key);
    cache_.emplace(key,CacheEntry{neighbors,bytes,lru_.begin()});
    cacheBytes_+=bytes;
}

void OrdGraphProvider::fetch(const std::string& smiles,std::size_t maxLinks,
                              std::vector<Neighbor>& neighbors,bool& truncated,
                              OrdPathResult& stats) {
    truncated=false;
    auto hit=cache_.find(smiles);
    if(hit!=cache_.end()) {
        ++stats.cacheHits;
        // A complete cached adjacency list can be larger than this request's
        // per-vertex budget. Never return a silently truncated exact result.
        if(hit->second.neighbors.size()>maxLinks) {truncated=true;return;}
        lru_.splice(lru_.begin(),lru_,hit->second.position);
        neighbors=hit->second.neighbors;
        return;
    }
    ++stats.cacheMisses;
    ++stats.sqlQueries;
    resetStatement(adjacent_);
    sqlCheck(sqlite3_bind_text(adjacent_,1,smiles.c_str(),
                              static_cast<int>(smiles.size()),SQLITE_TRANSIENT),
             db_,"Bind ORD adjacency compound");
    try {
        int rc=SQLITE_ROW;
        while((rc=sqlite3_step(adjacent_))==SQLITE_ROW) {
            if(neighbors.size()>=maxLinks) {truncated=true;break;}
            const unsigned char* value=sqlite3_column_text(adjacent_,1);
            if(!value) continue;
            const std::string target(reinterpret_cast<const char*>(value));
            if(target.empty() || target.size()>MAX_SMILES)continue;
            neighbors.push_back({target,sqlite3_column_int64(adjacent_,0)});
        }
        if(rc!=SQLITE_DONE && rc!=SQLITE_ROW)
            throw std::runtime_error(std::string("ORD SQL adjacency failed: ")+sqlite3_errmsg(db_));
    } catch (...) {
        resetStatement(adjacent_);
        throw;
    }
    resetStatement(adjacent_);
    if(!truncated)insertCache(smiles,neighbors);
}

std::string OrdGraphProvider::ordId(std::int64_t id,OrdPathResult& stats) {
    ++stats.sqlQueries;
    resetStatement(lookupId_);
    sqlCheck(sqlite3_bind_int64(lookupId_,1,id),db_,"Bind ORD reaction ID");
    std::string result;
    const int rc=sqlite3_step(lookupId_);
    if(rc==SQLITE_ROW) {
        const unsigned char* text=sqlite3_column_text(lookupId_,0);
        if(text)result=reinterpret_cast<const char*>(text);
    } else if(rc!=SQLITE_DONE) {
        resetStatement(lookupId_);
        throw std::runtime_error(std::string("ORD reaction lookup failed: ")+sqlite3_errmsg(db_));
    }
    resetStatement(lookupId_);
    return result;
}

OrdPathResult OrdGraphProvider::shortestPath(const std::string& from,
                                            const std::string& to,
                                            const OrdSearchOptions& options) {
    if(from.empty() || to.empty() || from.size()>MAX_SMILES ||
       to.size()>MAX_SMILES || from.find_first_of("\t\r\n")!=std::string::npos ||
       to.find_first_of("\t\r\n")!=std::string::npos)
        throw std::invalid_argument("ORD search requires valid exact indexed compound strings");
    if(options.maxExpanded<1 || options.maxVisited<2 || options.maxNeighborLinks<1 ||
       options.maxExpanded>100000 || options.maxVisited>200000 ||
       options.maxNeighborLinks>250000 || options.cacheBudgetBytes>256*1024*1024)
        throw std::invalid_argument("ORD search exceeds resource bounds");
    const auto began=std::chrono::steady_clock::now();
    cacheBudgetBytes_=options.cacheBudgetBytes;
    while(!lru_.empty() && cacheBytes_>cacheBudgetBytes_) {
        auto last=std::prev(lru_.end());
        const auto it=cache_.find(*last);
        if(it!=cache_.end()) {cacheBytes_-=it->second.bytes;cache_.erase(it);}
        lru_.erase(last);
    }
    OrdPathResult result;
    struct Node {std::string smiles;int parent;std::int64_t reactionId;};
    std::vector<Node> discovered;
    discovered.reserve(std::min(options.maxVisited,static_cast<std::size_t>(4096)));
    std::unordered_map<std::string,int> index;
    index.reserve(std::min(options.maxVisited,static_cast<std::size_t>(4096)));
    std::queue<int> frontier;
    discovered.push_back({from,-1,-1});
    index.emplace(from,0);
    frontier.push(0);
    int goal=(from==to)?0:-1;

    while(goal<0 && !frontier.empty() && result.complete) {
        if(result.expanded>=options.maxExpanded) {
            result.complete=false;
            result.limitReason="maxExpanded";
            break;
        }
        const int current=frontier.front();
        frontier.pop();
        ++result.expanded;
        std::vector<Neighbor> neighbors;
        bool tooMany=false;
        fetch(discovered[current].smiles,options.maxNeighborLinks,neighbors,tooMany,result);
        if(tooMany) {
            result.complete=false;
            result.limitReason="maxNeighborLinks";
            break;
        }
        for(const auto& edge:neighbors) {
            ++result.participationLinksExamined;
            if(index.find(edge.smiles)!=index.end())continue;
            if(discovered.size()>=options.maxVisited) {
                result.complete=false;
                result.limitReason="maxVisited";
                break;
            }
            const int id=static_cast<int>(discovered.size());
            discovered.push_back({edge.smiles,current,edge.reactionId});
            index.emplace(edge.smiles,id);
            frontier.push(id);
            if(edge.smiles==to){goal=id;break;}
        }
    }
    result.found=goal>=0;
    result.visited=discovered.size();
    if(result.found) {
        std::vector<int> chain;
        for(int current=goal;current>=0;current=discovered[current].parent)
            chain.push_back(current);
        std::reverse(chain.begin(),chain.end());
        if(chain.size()>MAX_PATH_STEPS+1) {
            result.found=false;
            result.complete=false;
            result.limitReason="maxPathDisplaySteps";
        } else {
            for(std::size_t i=0;i<chain.size();++i) {
                const auto& state=discovered[chain[i]];
                result.compounds.push_back(state.smiles);
                if(i>0) {
                    const auto& previous=discovered[chain[i-1]];
                    result.steps.push_back({previous.smiles,state.smiles,state.reactionId,
                                            ordId(state.reactionId,result)});
                }
            }
        }
    }
    result.cachedBytes=cacheBytes_;
    result.cacheEntries=cache_.size();
    result.elapsedMs=std::chrono::duration<double,std::milli>(
        std::chrono::steady_clock::now()-began).count();
    return result;
}

} // namespace chempath
