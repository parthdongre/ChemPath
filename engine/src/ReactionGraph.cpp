#include "ReactionGraph.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <deque>
#include <fstream>
#include <functional>
#include <limits>
#include <queue>
#include <stack>
#include <tuple>
#include <utility>

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
        if (cols.size() < 10) continue;

        Reaction reaction;
        reaction.id = std::stoi(cols[0]);
        reaction.name = cols[1];
        reaction.equation = cols[4];
        reaction.conditions = cols[5];
        reaction.reversible = normalize(cols[6]) == "true";
        reaction.note = cols[7];
        reaction.sourceKey = cols[8];
        reaction.cost = std::max(1, std::stoi(cols[9]));

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

        // Compound-level projection of a multi-reactant reaction:
        // the first listed reactant is the primary substrate. Additional
        // reactants are co-reactants/reagents and must not independently
        // initiate the reaction in the graph.
        const int primaryReactant = reaction.reactants.front();
        for (int to : reaction.products) {
            adjacency_[primaryReactant].push_back({to, reaction.id, reaction.cost});
        }

        // For an explicitly reversible reaction, the first listed product is
        // the designated primary product. This avoids treating side products
        // such as water, hydronium, or hydroxide as independent reverse
        // substrates while still preserving reversible connectivity.
        if (reaction.reversible && !reaction.products.empty()) {
            const int primaryProduct = reaction.products.front();
            adjacency_[primaryProduct].push_back(
                {primaryReactant, reaction.id, reaction.cost});
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
    result.totalCost = static_cast<int>(result.reactionIds.size());
    return result;
}

PathResult ReactionGraph::shortestPathDijkstra(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    const int infinity = std::numeric_limits<int>::max() / 4;
    std::vector<int> distance(compounds_.size(), infinity);
    std::vector<int> parent(compounds_.size(), -1);
    std::vector<int> parentReaction(compounds_.size(), -1);
    std::vector<bool> settled(compounds_.size(), false);

    using State = std::pair<int, int>;
    std::priority_queue<State, std::vector<State>, std::greater<State>> queue;

    distance[*start] = 0;
    queue.push({0, *start});

    while (!queue.empty()) {
        const auto [currentDistance, current] = queue.top();
        queue.pop();

        if (settled[current]) continue;
        settled[current] = true;
        result.visitedOrder.push_back(current);

        if (current == *target) break;

        for (const auto& edge : adjacency_[current]) {
            if (currentDistance + edge.cost < distance[edge.to]) {
                distance[edge.to] = currentDistance + edge.cost;
                parent[edge.to] = current;
                parentReaction[edge.to] = edge.reactionId;
                queue.push({distance[edge.to], edge.to});
            }
        }
    }

    if (distance[*target] == infinity) return result;

    result.found = true;
    result.totalCost = distance[*target];

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


PathResult ReactionGraph::shortestPathAStar(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    const int count = static_cast<int>(compounds_.size());
    const int infinity = std::numeric_limits<int>::max() / 4;

    // A chemistry-independent admissible heuristic:
    // reverse BFS gives the minimum number of remaining edges, and every
    // reaction edge costs at least minEdgeCost. Therefore
    // h(v) = remainingHops(v) * minEdgeCost never overestimates.
    std::vector<std::vector<int>> reverseAdjacency(count);
    int minEdgeCost = infinity;
    for (int u = 0; u < count; ++u) {
        for (const auto& edge : adjacency_[u]) {
            reverseAdjacency[edge.to].push_back(u);
            minEdgeCost = std::min(minEdgeCost, edge.cost);
        }
    }
    if (minEdgeCost == infinity) return result;

    std::vector<int> hops(count, infinity);
    std::queue<int> hopQueue;
    hops[*target] = 0;
    hopQueue.push(*target);

    while (!hopQueue.empty()) {
        const int current = hopQueue.front();
        hopQueue.pop();

        for (int predecessor : reverseAdjacency[current]) {
            if (hops[predecessor] != infinity) continue;
            hops[predecessor] = hops[current] + 1;
            hopQueue.push(predecessor);
        }
    }

    if (hops[*start] == infinity) return result;

    std::vector<int> distance(count, infinity);
    std::vector<int> parent(count, -1);
    std::vector<int> parentReaction(count, -1);
    std::vector<bool> closed(count, false);

    using State = std::tuple<int, int, int>; // f, g, vertex
    std::priority_queue<State, std::vector<State>, std::greater<State>> open;

    distance[*start] = 0;
    open.push({hops[*start] * minEdgeCost, 0, *start});

    while (!open.empty()) {
        const auto [estimatedTotal, currentDistance, current] = open.top();
        (void)estimatedTotal;
        open.pop();

        if (closed[current] || currentDistance != distance[current]) continue;
        closed[current] = true;
        result.visitedOrder.push_back(current);

        if (current == *target) break;

        for (const auto& edge : adjacency_[current]) {
            const int candidate = currentDistance + edge.cost;
            if (candidate >= distance[edge.to]) continue;

            distance[edge.to] = candidate;
            parent[edge.to] = current;
            parentReaction[edge.to] = edge.reactionId;

            const int heuristic =
                hops[edge.to] == infinity ? 0 : hops[edge.to] * minEdgeCost;
            open.push({candidate + heuristic, candidate, edge.to});
        }
    }

    if (distance[*target] == infinity) return result;

    result.found = true;
    result.totalCost = distance[*target];

    for (int cursor = *target; cursor != -1; cursor = parent[cursor]) {
        result.compoundIds.push_back(cursor);
        if (parentReaction[cursor] != -1) {
            result.reactionIds.push_back(parentReaction[cursor]);
        }
    }

    std::reverse(result.compoundIds.begin(), result.compoundIds.end());
    std::reverse(result.reactionIds.begin(), result.reactionIds.end());
    return result;
}

PathResult ReactionGraph::shortestPathDial(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    const int count = static_cast<int>(compounds_.size());
    const int infinity = std::numeric_limits<int>::max() / 4;

    int maxEdgeCost = 0;
    for (const auto& edges : adjacency_) {
        for (const auto& edge : edges) {
            maxEdgeCost = std::max(maxEdgeCost, edge.cost);
        }
    }
    if (maxEdgeCost <= 0) return result;

    // Any shortest path can be taken simple, so at most V-1 positive edges.
    const int maxDistance = maxEdgeCost * std::max(1, count - 1);
    std::vector<std::deque<int>> buckets(static_cast<std::size_t>(maxDistance) + 1);

    std::vector<int> distance(count, infinity);
    std::vector<int> parent(count, -1);
    std::vector<int> parentReaction(count, -1);
    std::vector<bool> settled(count, false);

    distance[*start] = 0;
    buckets[0].push_back(*start);

    int currentBucket = 0;
    while (currentBucket <= maxDistance) {
        while (currentBucket <= maxDistance && buckets[currentBucket].empty()) {
            ++currentBucket;
        }
        if (currentBucket > maxDistance) break;

        const int current = buckets[currentBucket].front();
        buckets[currentBucket].pop_front();

        if (settled[current] || distance[current] != currentBucket) continue;
        settled[current] = true;
        result.visitedOrder.push_back(current);

        if (current == *target) break;

        for (const auto& edge : adjacency_[current]) {
            const int candidate = currentBucket + edge.cost;
            if (candidate >= distance[edge.to] || candidate > maxDistance) continue;

            distance[edge.to] = candidate;
            parent[edge.to] = current;
            parentReaction[edge.to] = edge.reactionId;
            buckets[candidate].push_back(edge.to);
        }
    }

    if (distance[*target] == infinity) return result;

    result.found = true;
    result.totalCost = distance[*target];

    for (int cursor = *target; cursor != -1; cursor = parent[cursor]) {
        result.compoundIds.push_back(cursor);
        if (parentReaction[cursor] != -1) {
            result.reactionIds.push_back(parentReaction[cursor]);
        }
    }

    std::reverse(result.compoundIds.begin(), result.compoundIds.end());
    std::reverse(result.reactionIds.begin(), result.reactionIds.end());
    return result;
}

PathResult ReactionGraph::shortestPathBellmanFord(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    const int count = static_cast<int>(compounds_.size());
    const int infinity = std::numeric_limits<int>::max() / 4;

    std::vector<int> distance(count, infinity);
    std::vector<int> parent(count, -1);
    std::vector<int> parentReaction(count, -1);
    std::vector<bool> traced(count, false);

    distance[*start] = 0;
    traced[*start] = true;
    result.visitedOrder.push_back(*start);

    for (int pass = 0; pass < count - 1; ++pass) {
        bool changed = false;

        for (int current = 0; current < count; ++current) {
            if (distance[current] == infinity) continue;

            for (const auto& edge : adjacency_[current]) {
                const int candidate = distance[current] + edge.cost;
                if (candidate >= distance[edge.to]) continue;

                distance[edge.to] = candidate;
                parent[edge.to] = current;
                parentReaction[edge.to] = edge.reactionId;
                changed = true;

                if (!traced[edge.to]) {
                    traced[edge.to] = true;
                    result.visitedOrder.push_back(edge.to);
                }
            }
        }

        if (!changed) break;
    }

    if (distance[*target] == infinity) return result;

    result.found = true;
    result.totalCost = distance[*target];

    for (int cursor = *target; cursor != -1; cursor = parent[cursor]) {
        result.compoundIds.push_back(cursor);
        if (parentReaction[cursor] != -1) {
            result.reactionIds.push_back(parentReaction[cursor]);
        }
    }

    std::reverse(result.compoundIds.begin(), result.compoundIds.end());
    std::reverse(result.reactionIds.begin(), result.reactionIds.end());
    return result;
}

PathResult ReactionGraph::shortestPathBidirectionalDijkstra(
    const std::string& from,
    const std::string& to) const {

    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    if (*start == *target) {
        result.found = true;
        result.compoundIds = {*start};
        result.visitedOrder = {*start};
        return result;
    }

    const int count = static_cast<int>(compounds_.size());
    const int infinity = std::numeric_limits<int>::max() / 4;

    std::vector<std::vector<Edge>> reverseAdjacency(count);
    for (int u = 0; u < count; ++u) {
        for (const auto& edge : adjacency_[u]) {
            reverseAdjacency[edge.to].push_back({u, edge.reactionId, edge.cost});
        }
    }

    std::vector<int> forwardDistance(count, infinity);
    std::vector<int> backwardDistance(count, infinity);
    std::vector<int> forwardParent(count, -1);
    std::vector<int> forwardReaction(count, -1);
    std::vector<int> backwardNext(count, -1);
    std::vector<int> backwardReaction(count, -1);
    std::vector<bool> forwardSettled(count, false);
    std::vector<bool> backwardSettled(count, false);
    std::vector<bool> traced(count, false);

    using State = std::pair<int, int>;
    std::priority_queue<State, std::vector<State>, std::greater<State>> forwardQueue;
    std::priority_queue<State, std::vector<State>, std::greater<State>> backwardQueue;

    forwardDistance[*start] = 0;
    backwardDistance[*target] = 0;
    forwardQueue.push({0, *start});
    backwardQueue.push({0, *target});

    int bestDistance = infinity;
    int meeting = -1;

    auto trace = [&](int node) {
        if (!traced[node]) {
            traced[node] = true;
            result.visitedOrder.push_back(node);
        }
    };

    while (!forwardQueue.empty() && !backwardQueue.empty()) {
        const int minForward = forwardQueue.top().first;
        const int minBackward = backwardQueue.top().first;
        if (bestDistance != infinity && minForward + minBackward >= bestDistance) break;

        if (minForward <= minBackward) {
            const auto [distance, current] = forwardQueue.top();
            forwardQueue.pop();
            if (forwardSettled[current] || distance != forwardDistance[current]) continue;

            forwardSettled[current] = true;
            trace(current);

            if (backwardDistance[current] != infinity &&
                distance + backwardDistance[current] < bestDistance) {
                bestDistance = distance + backwardDistance[current];
                meeting = current;
            }

            for (const auto& edge : adjacency_[current]) {
                const int candidate = distance + edge.cost;
                if (candidate < forwardDistance[edge.to]) {
                    forwardDistance[edge.to] = candidate;
                    forwardParent[edge.to] = current;
                    forwardReaction[edge.to] = edge.reactionId;
                    forwardQueue.push({candidate, edge.to});
                }

                if (backwardDistance[edge.to] != infinity &&
                    candidate + backwardDistance[edge.to] < bestDistance) {
                    bestDistance = candidate + backwardDistance[edge.to];
                    meeting = edge.to;
                }
            }
        } else {
            const auto [distance, current] = backwardQueue.top();
            backwardQueue.pop();
            if (backwardSettled[current] || distance != backwardDistance[current]) continue;

            backwardSettled[current] = true;
            trace(current);

            if (forwardDistance[current] != infinity &&
                distance + forwardDistance[current] < bestDistance) {
                bestDistance = distance + forwardDistance[current];
                meeting = current;
            }

            for (const auto& reverseEdge : reverseAdjacency[current]) {
                const int predecessor = reverseEdge.to;
                const int candidate = distance + reverseEdge.cost;

                if (candidate < backwardDistance[predecessor]) {
                    backwardDistance[predecessor] = candidate;
                    backwardNext[predecessor] = current;
                    backwardReaction[predecessor] = reverseEdge.reactionId;
                    backwardQueue.push({candidate, predecessor});
                }

                if (forwardDistance[predecessor] != infinity &&
                    candidate + forwardDistance[predecessor] < bestDistance) {
                    bestDistance = candidate + forwardDistance[predecessor];
                    meeting = predecessor;
                }
            }
        }
    }

    if (meeting == -1 || bestDistance == infinity) return result;

    result.found = true;
    result.totalCost = bestDistance;

    std::vector<int> leftNodes;
    std::vector<int> leftReactions;
    for (int cursor = meeting; cursor != -1; cursor = forwardParent[cursor]) {
        leftNodes.push_back(cursor);
        if (forwardReaction[cursor] != -1) leftReactions.push_back(forwardReaction[cursor]);
    }
    std::reverse(leftNodes.begin(), leftNodes.end());
    std::reverse(leftReactions.begin(), leftReactions.end());

    result.compoundIds = std::move(leftNodes);
    result.reactionIds = std::move(leftReactions);

    int cursor = meeting;
    while (backwardNext[cursor] != -1) {
        result.reactionIds.push_back(backwardReaction[cursor]);
        cursor = backwardNext[cursor];
        result.compoundIds.push_back(cursor);
    }

    return result;
}

PathResult ReactionGraph::shortestPathPivotFrontier(
    const std::string& from,
    const std::string& to) const {

    // Educational exact hybrid inspired by the frontier-reduction idea in
    // Duan, Mao, Mao, Shu & Yin (STOC 2025). This is intentionally NOT a
    // claim to implement their full O(m log^(2/3) n) BMSSP construction.
    // We first perform k unsorted Bellman-Ford-like frontier rounds, then
    // finish exactly with a warm-started Dijkstra cleanup.
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    const int count = static_cast<int>(compounds_.size());
    const int infinity = std::numeric_limits<int>::max() / 4;
    const double logN = std::log2(static_cast<double>(std::max(2, count)));
    const int k = std::max(1, static_cast<int>(std::ceil(std::cbrt(logN))));

    std::vector<int> distance(count, infinity);
    std::vector<int> parent(count, -1);
    std::vector<int> parentReaction(count, -1);
    std::vector<bool> traced(count, false);

    distance[*start] = 0;
    traced[*start] = true;
    result.visitedOrder.push_back(*start);

    std::vector<int> frontier{*start};

    for (int round = 0; round < k && !frontier.empty(); ++round) {
        std::vector<int> nextFrontier;
        std::vector<bool> queued(count, false);

        for (int current : frontier) {
            for (const auto& edge : adjacency_[current]) {
                const int candidate = distance[current] + edge.cost;
                if (candidate >= distance[edge.to]) continue;

                distance[edge.to] = candidate;
                parent[edge.to] = current;
                parentReaction[edge.to] = edge.reactionId;

                if (!queued[edge.to]) {
                    queued[edge.to] = true;
                    nextFrontier.push_back(edge.to);
                }
                if (!traced[edge.to]) {
                    traced[edge.to] = true;
                    result.visitedOrder.push_back(edge.to);
                }
            }
        }

        frontier = std::move(nextFrontier);
    }

    using State = std::pair<int, int>;
    std::priority_queue<State, std::vector<State>, std::greater<State>> queue;
    for (int node = 0; node < count; ++node) {
        if (distance[node] != infinity) {
            queue.push({distance[node], node});
        }
    }

    std::vector<bool> settled(count, false);

    while (!queue.empty()) {
        const auto [currentDistance, current] = queue.top();
        queue.pop();

        if (settled[current] || currentDistance != distance[current]) continue;
        settled[current] = true;

        if (!traced[current]) {
            traced[current] = true;
            result.visitedOrder.push_back(current);
        }

        if (current == *target) break;

        for (const auto& edge : adjacency_[current]) {
            const int candidate = currentDistance + edge.cost;
            if (candidate >= distance[edge.to]) continue;

            distance[edge.to] = candidate;
            parent[edge.to] = current;
            parentReaction[edge.to] = edge.reactionId;
            queue.push({candidate, edge.to});
        }
    }

    if (distance[*target] == infinity) return result;

    result.found = true;
    result.totalCost = distance[*target];

    for (int cursor = *target; cursor != -1; cursor = parent[cursor]) {
        result.compoundIds.push_back(cursor);
        if (parentReaction[cursor] != -1) {
            result.reactionIds.push_back(parentReaction[cursor]);
        }
    }

    std::reverse(result.compoundIds.begin(), result.compoundIds.end());
    std::reverse(result.reactionIds.begin(), result.reactionIds.end());
    return result;
}

PathResult ReactionGraph::shortestPathBidirectional(const std::string& from, const std::string& to) const {
    PathResult result;

    const auto start = compoundId(from);
    const auto target = compoundId(to);
    if (!start || !target) return result;

    if (*start == *target) {
        result.found = true;
        result.compoundIds = {*start};
        result.visitedOrder = {*start};
        return result;
    }

    std::vector<std::vector<Edge>> reverseAdjacency(compounds_.size());
    for (std::size_t fromId = 0; fromId < adjacency_.size(); ++fromId) {
        for (const auto& edge : adjacency_[fromId]) {
            reverseAdjacency[edge.to].push_back(
                {static_cast<int>(fromId), edge.reactionId, edge.cost});
        }
    }

    std::vector<bool> visitedForward(compounds_.size(), false);
    std::vector<bool> visitedBackward(compounds_.size(), false);
    std::vector<int> parentForward(compounds_.size(), -1);
    std::vector<int> reactionForward(compounds_.size(), -1);
    std::vector<int> nextBackward(compounds_.size(), -1);
    std::vector<int> reactionBackward(compounds_.size(), -1);

    std::queue<int> forwardQueue;
    std::queue<int> backwardQueue;

    visitedForward[*start] = true;
    visitedBackward[*target] = true;
    forwardQueue.push(*start);
    backwardQueue.push(*target);

    int meeting = -1;

    auto expandForward = [&]() {
        if (forwardQueue.empty()) return;
        const int current = forwardQueue.front();
        forwardQueue.pop();
        result.visitedOrder.push_back(current);

        if (visitedBackward[current]) {
            meeting = current;
            return;
        }

        for (const auto& edge : adjacency_[current]) {
            if (!visitedForward[edge.to]) {
                visitedForward[edge.to] = true;
                parentForward[edge.to] = current;
                reactionForward[edge.to] = edge.reactionId;
                forwardQueue.push(edge.to);
            }
            if (visitedBackward[edge.to]) {
                meeting = edge.to;
                return;
            }
        }
    };

    auto expandBackward = [&]() {
        if (backwardQueue.empty()) return;
        const int current = backwardQueue.front();
        backwardQueue.pop();
        if (std::find(result.visitedOrder.begin(), result.visitedOrder.end(), current)
            == result.visitedOrder.end()) {
            result.visitedOrder.push_back(current);
        }

        if (visitedForward[current]) {
            meeting = current;
            return;
        }

        for (const auto& reverseEdge : reverseAdjacency[current]) {
            const int predecessor = reverseEdge.to;
            if (!visitedBackward[predecessor]) {
                visitedBackward[predecessor] = true;
                nextBackward[predecessor] = current;
                reactionBackward[predecessor] = reverseEdge.reactionId;
                backwardQueue.push(predecessor);
            }
            if (visitedForward[predecessor]) {
                meeting = predecessor;
                return;
            }
        }
    };

    while (!forwardQueue.empty() && !backwardQueue.empty() && meeting == -1) {
        if (forwardQueue.size() <= backwardQueue.size()) {
            expandForward();
        } else {
            expandBackward();
        }
    }

    if (meeting == -1) return result;

    result.found = true;

    std::vector<int> leftNodes;
    std::vector<int> leftReactions;
    for (int cursor = meeting; cursor != -1; cursor = parentForward[cursor]) {
        leftNodes.push_back(cursor);
        if (reactionForward[cursor] != -1) leftReactions.push_back(reactionForward[cursor]);
    }
    std::reverse(leftNodes.begin(), leftNodes.end());
    std::reverse(leftReactions.begin(), leftReactions.end());

    result.compoundIds = leftNodes;
    result.reactionIds = leftReactions;

    int cursor = meeting;
    while (nextBackward[cursor] != -1) {
        result.reactionIds.push_back(reactionBackward[cursor]);
        cursor = nextBackward[cursor];
        result.compoundIds.push_back(cursor);
    }

    result.totalCost = static_cast<int>(result.reactionIds.size());
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

SccResult ReactionGraph::stronglyConnectedComponents() const {
    SccResult result;
    const int count = static_cast<int>(compounds_.size());

    std::vector<int> index(count, -1);
    std::vector<int> lowLink(count, -1);
    std::vector<bool> onStack(count, false);
    std::vector<int> stack;
    int nextIndex = 0;

    std::function<void(int)> visit = [&](int node) {
        index[node] = nextIndex;
        lowLink[node] = nextIndex;
        ++nextIndex;

        stack.push_back(node);
        onStack[node] = true;
        result.visitedOrder.push_back(node);

        for (const auto& edge : adjacency_[node]) {
            const int next = edge.to;
            if (index[next] == -1) {
                visit(next);
                lowLink[node] = std::min(lowLink[node], lowLink[next]);
            } else if (onStack[next]) {
                lowLink[node] = std::min(lowLink[node], index[next]);
            }
        }

        if (lowLink[node] == index[node]) {
            std::vector<int> component;
            while (!stack.empty()) {
                const int top = stack.back();
                stack.pop_back();
                onStack[top] = false;
                component.push_back(top);
                if (top == node) break;
            }
            result.components.push_back(std::move(component));
        }
    };

    for (int node = 0; node < count; ++node) {
        if (index[node] == -1) visit(node);
    }

    std::sort(
        result.components.begin(),
        result.components.end(),
        [](const auto& left, const auto& right) {
            return left.size() > right.size();
        });

    return result;
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
