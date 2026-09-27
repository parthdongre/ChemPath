#include "ReactionGraph.hpp"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <queue>
#include <stack>

namespace chempath {

std::string ReactionGraph::trim(const std::string& value) {
    const auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return "";
    const auto last = value.find_last_not_of(" \t\r\n");
    return value.substr(first, last - first + 1);
}

std::string ReactionGraph::normalize(const std::string& value) {
    std::string out;
    for (unsigned char ch : trim(value)) {
        out.push_back(static_cast<char>(std::tolower(ch)));
    }
    return out;
}

std::vector<std::string> ReactionGraph::split(const std::string& value, char delimiter) {
    std::vector<std::string> parts;
    std::string current;
    for (char ch : value) {
        if (ch == delimiter) {
            parts.push_back(trim(current));
            current.clear();
        } else {
            current.push_back(ch);
        }
    }
    parts.push_back(trim(current));
    return parts;
}

bool ReactionGraph::loadCompounds(const std::string& path) {
    std::ifstream file(path);
    if (!file) return false;

    compounds_.clear();
    nameToId_.clear();
    trie_ = Trie{};

    std::string line;
    bool firstLine = true;
    while (std::getline(file, line)) {
        if (trim(line).empty()) continue;
        if (firstLine) {
            firstLine = false;
            if (line.rfind("id|", 0) == 0) continue;
        }

        const auto cols = split(line, '|');
        if (cols.size() < 4) continue;

        Compound c;
        c.id = std::stoi(cols[0]);
        c.name = cols[1];
        c.formula = cols[2];
        c.category = cols[3];

        if (static_cast<std::size_t>(c.id) >= compounds_.size()) {
            compounds_.resize(static_cast<std::size_t>(c.id) + 1);
        }
        compounds_[c.id] = c;
        nameToId_[normalize(c.name)] = c.id;
        trie_.insert(c.name, c.id);
        if (!c.formula.empty()) trie_.insert(c.formula, c.id);
    }

    adjacency_.assign(compounds_.size(), {});
    return !compounds_.empty();
}

bool ReactionGraph::loadReactions(const std::string& path) {
    std::ifstream file(path);
    if (!file) return false;

    reactions_.clear();
    reactionIndexById_.clear();

    std::string line;
    bool firstLine = true;
    while (std::getline(file, line)) {
        if (trim(line).empty()) continue;
        if (firstLine) {
            firstLine = false;
            if (line.rfind("id|", 0) == 0) continue;
        }

        const auto cols = split(line, '|');
        if (cols.size() < 5) continue;

        Reaction reaction;
        reaction.id = std::stoi(cols[0]);
        reaction.name = cols[1];
        reaction.note = cols[4];

        bool valid = true;
        for (const auto& reactantName : split(cols[2], ';')) {
            const auto id = compoundId(reactantName);
            if (!id) {
                valid = false;
                break;
            }
            reaction.reactants.push_back(*id);
        }
        if (!valid) continue;

        for (const auto& productName : split(cols[3], ';')) {
            const auto id = compoundId(productName);
            if (!id) {
                valid = false;
                break;
            }
            reaction.products.push_back(*id);
        }
        if (!valid || reaction.reactants.empty() || reaction.products.empty()) continue;

        reactionIndexById_[reaction.id] = reactions_.size();
        reactions_.push_back(reaction);

        for (int from : reaction.reactants) {
            for (int to : reaction.products) {
                adjacency_[from].push_back({to, reaction.id});
            }
        }
    }

    return !reactions_.empty();
}

bool ReactionGraph::loadFromFiles(const std::string& compoundsPath, const std::string& reactionsPath) {
    return loadCompounds(compoundsPath) && loadReactions(reactionsPath);
}

const std::vector<Compound>& ReactionGraph::compounds() const {
    return compounds_;
}

const std::vector<Reaction>& ReactionGraph::reactions() const {
    return reactions_;
}

const std::vector<std::vector<Edge>>& ReactionGraph::adjacency() const {
    return adjacency_;
}

std::optional<int> ReactionGraph::compoundId(const std::string& name) const {
    const auto it = nameToId_.find(normalize(name));
    if (it == nameToId_.end()) return std::nullopt;
    return it->second;
}

const Compound* ReactionGraph::compound(int id) const {
    if (id < 0 || static_cast<std::size_t>(id) >= compounds_.size()) return nullptr;
    return &compounds_[id];
}

const Reaction* ReactionGraph::reaction(int id) const {
    const auto it = reactionIndexById_.find(id);
    if (it == reactionIndexById_.end()) return nullptr;
    return &reactions_[it->second];
}

PathResult ReactionGraph::shortestPathBfs(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    std::vector<bool> visited(compounds_.size(), false);
    std::vector<int> parent(compounds_.size(), -1);
    std::vector<int> parentReaction(compounds_.size(), -1);
    std::queue<int> queue;

    visited[*start] = true;
    queue.push(*start);

    while (!queue.empty()) {
        const int current = queue.front();
        queue.pop();
        result.visitedOrder.push_back(current);

        if (current == *target) break;

        for (const auto& edge : adjacency_[current]) {
            if (visited[edge.to]) continue;
            visited[edge.to] = true;
            parent[edge.to] = current;
            parentReaction[edge.to] = edge.reactionId;
            queue.push(edge.to);
        }
    }

    if (!visited[*target]) return result;

    result.found = true;
    std::vector<int> reversedCompounds;
    std::vector<int> reversedReactions;

    for (int cursor = *target; cursor != -1; cursor = parent[cursor]) {
        reversedCompounds.push_back(cursor);
        if (parentReaction[cursor] != -1) {
            reversedReactions.push_back(parentReaction[cursor]);
        }
    }

    std::reverse(reversedCompounds.begin(), reversedCompounds.end());
    std::reverse(reversedReactions.begin(), reversedReactions.end());
    result.compoundIds = std::move(reversedCompounds);
    result.reactionIds = std::move(reversedReactions);
    return result;
}

std::vector<int> ReactionGraph::reachableDfs(const std::string& from) const {
    const auto start = compoundId(from);
    if (!start) return {};

    std::vector<bool> visited(compounds_.size(), false);
    std::vector<int> order;
    std::stack<int> stack;
    stack.push(*start);

    while (!stack.empty()) {
        const int current = stack.top();
        stack.pop();
        if (visited[current]) continue;

        visited[current] = true;
        order.push_back(current);

        const auto& edges = adjacency_[current];
        for (auto it = edges.rbegin(); it != edges.rend(); ++it) {
            if (!visited[it->to]) stack.push(it->to);
        }
    }

    return order;
}

bool ReactionGraph::dfsCycle(
    int node,
    std::vector<int>& state,
    std::vector<int>& parent,
    std::vector<int>& cycle) const {

    state[node] = 1;

    for (const auto& edge : adjacency_[node]) {
        const int next = edge.to;
        if (state[next] == 0) {
            parent[next] = node;
            if (dfsCycle(next, state, parent, cycle)) return true;
        } else if (state[next] == 1) {
            cycle.push_back(next);
            for (int cursor = node; cursor != next && cursor != -1; cursor = parent[cursor]) {
                cycle.push_back(cursor);
            }
            cycle.push_back(next);
            std::reverse(cycle.begin(), cycle.end());
            return true;
        }
    }

    state[node] = 2;
    return false;
}

std::vector<int> ReactionGraph::firstDirectedCycle() const {
    std::vector<int> state(compounds_.size(), 0);
    std::vector<int> parent(compounds_.size(), -1);
    std::vector<int> cycle;

    for (std::size_t i = 0; i < compounds_.size(); ++i) {
        if (state[i] == 0 && dfsCycle(static_cast<int>(i), state, parent, cycle)) {
            return cycle;
        }
    }
    return {};
}

std::vector<int> ReactionGraph::searchCompounds(const std::string& prefix, std::size_t limit) const {
    return trie_.searchPrefix(prefix, limit);
}

std::size_t ReactionGraph::edgeCount() const {
    std::size_t count = 0;
    for (const auto& edges : adjacency_) count += edges.size();
    return count;
}

} // namespace chempath
