#include "ReactionGraph.hpp"

#include <algorithm>
#include <cctype>
#include <fstream>
#include <functional>
#include <limits>
#include <queue>
#include <stack>
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
        if (cols.size() < 9) continue;

        Reaction reaction;
        reaction.id = std::stoi(cols[0]);
        reaction.name = cols[1];
        reaction.equation = cols[4];
        reaction.conditions = cols[5];
        reaction.note = cols[6];
        reaction.sourceKey = cols[7];
        reaction.cost = std::max(1, std::stoi(cols[8]));

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
                adjacency_[from].push_back({to, reaction.id, reaction.cost});
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
