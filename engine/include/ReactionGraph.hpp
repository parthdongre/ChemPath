#pragma once

#include "Models.hpp"
#include "Trie.hpp"

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace chempath {

class ReactionGraph {
public:
    bool loadFromFiles(const std::string& compoundsPath, const std::string& reactionsPath);

    const std::vector<Compound>& compounds() const;
    const std::vector<Reaction>& reactions() const;
    const std::vector<std::vector<Edge>>& adjacency() const;

    std::optional<int> compoundId(const std::string& name) const;
    const Compound* compound(int id) const;
    const Reaction* reaction(int id) const;

    PathResult shortestPathBfs(const std::string& from, const std::string& to) const;
    std::vector<int> reachableDfs(const std::string& from) const;
    std::vector<int> firstDirectedCycle() const;
    std::vector<int> searchCompounds(const std::string& prefix, std::size_t limit = 8) const;

    std::size_t edgeCount() const;

private:
    std::vector<Compound> compounds_;
    std::vector<Reaction> reactions_;
    std::vector<std::vector<Edge>> adjacency_;
    std::unordered_map<std::string, int> nameToId_;
    std::unordered_map<int, std::size_t> reactionIndexById_;
    Trie trie_;

    static std::string normalize(const std::string& value);
    static std::string trim(const std::string& value);
    static std::vector<std::string> split(const std::string& value, char delimiter);

    bool loadCompounds(const std::string& path);
    bool loadReactions(const std::string& path);
    bool dfsCycle(
        int node,
        std::vector<int>& state,
        std::vector<int>& parent,
        std::vector<int>& cycle) const;
};

} // namespace chempath
