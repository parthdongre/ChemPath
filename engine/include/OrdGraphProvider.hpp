#pragma once

#include <cstddef>
#include <cstdint>
#include <list>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

struct sqlite3;
struct sqlite3_stmt;

namespace chempath {

// This is a directed reaction-PARTICIPATION graph, not a synthesis planner.
// Exact SMILES identity follows the indexed ORD dataset; no online RDKit
// canonicalization or inferred chemical equivalence is performed here.
struct OrdSearchOptions {
    std::size_t maxExpanded{2500};
    std::size_t maxVisited{20000};
    std::size_t maxNeighborLinks{25000};
    // Zero preserves the provider's constructor cache budget.
    std::size_t cacheBudgetBytes{0};
};

struct OrdPathStep {
    std::string from;
    std::string to;
    std::int64_t reactionRecordId{};
    std::string ordId;
};

struct OrdPathResult {
    bool found{false};
    bool complete{true};
    std::string limitReason;
    std::vector<std::string> compounds;
    std::vector<OrdPathStep> steps;
    std::size_t expanded{0};
    std::size_t visited{0};
    std::size_t participationLinksExamined{0};
    std::size_t sqlQueries{0};
    std::size_t cacheHits{0};
    std::size_t cacheMisses{0};
    std::size_t cachedBytes{0};
    std::size_t cacheEntries{0};
    double elapsedMs{0.0};
};

class OrdGraphProvider {
public:
    explicit OrdGraphProvider(const std::string& path,
                              std::size_t cacheBudgetBytes = 8 * 1024 * 1024);
    ~OrdGraphProvider();
    OrdGraphProvider(const OrdGraphProvider&) = delete;
    OrdGraphProvider& operator=(const OrdGraphProvider&) = delete;

    OrdPathResult shortestPath(const std::string& from, const std::string& to,
                               const OrdSearchOptions& options = {});
    std::size_t cachedBytes() const { return cacheBytes_; }
    std::size_t cacheEntries() const { return cache_.size(); }

private:
    struct Neighbor {
        std::string smiles;
        std::int64_t reactionId{};
    };
    struct CacheEntry {
        std::vector<Neighbor> neighbors;
        std::size_t bytes{};
        std::list<std::string>::iterator position;
    };

    sqlite3* db_{nullptr};
    sqlite3_stmt* adjacent_{nullptr};
    sqlite3_stmt* lookupId_{nullptr};
    sqlite3_stmt* existsAsCompound_{nullptr};
    std::size_t cacheBytes_{0};
    std::size_t cacheBudgetBytes_{0};
    std::list<std::string> lru_;
    std::unordered_map<std::string, CacheEntry> cache_;
    void fetch(const std::string& smiles, std::size_t maxLinks,
               std::vector<Neighbor>& neighbors, bool& truncated,
               OrdPathResult& stats);
    std::string ordId(std::int64_t id, OrdPathResult& stats);
    void insertCache(const std::string& key, const std::vector<Neighbor>& neighbors);
};

} // namespace chempath
