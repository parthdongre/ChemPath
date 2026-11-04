#include "ReactionDependencyGraph.hpp"

#include <algorithm>
#include <limits>
#include <queue>
#include <stdexcept>

namespace chempath {
namespace {
std::vector<int> uniqueIds(const std::vector<int>& ids, std::size_t count) {
    std::vector<int> result = ids;
    for (int id : result) {
        if (id < 0 || static_cast<std::size_t>(id) >= count)
            throw std::invalid_argument("Reaction references invalid compound ID");
    }
    std::sort(result.begin(), result.end());
    result.erase(std::unique(result.begin(), result.end()), result.end());
    return result;
}
}

ReactionDependencyGraph::ReactionDependencyGraph(
        std::size_t compoundCount, const std::vector<Reaction>& reactions)
    : compoundCount_(compoundCount), requiredByCompound_(compoundCount) {
    for (const Reaction& reaction : reactions) {
        if (reaction.reactants.empty() || reaction.products.empty()) continue;
        addDirection(reaction.id, false, reaction.reactants, reaction.products);
        if (reaction.reversible)
            addDirection(reaction.id, true, reaction.products, reaction.reactants);
    }
}

void ReactionDependencyGraph::addDirection(
        int reactionId, bool reverse, const std::vector<int>& required,
        const std::vector<int>& produced) {
    auto distinctRequired = uniqueIds(required, compoundCount_);
    auto distinctProduced = uniqueIds(produced, compoundCount_);
    if (distinctRequired.empty() || distinctProduced.empty()) return;
    if (directions_.size() >= static_cast<std::size_t>(std::numeric_limits<int>::max()))
        throw std::length_error("Too many reaction directions");
    const int index = static_cast<int>(directions_.size());
    for (int id : distinctRequired) requiredByCompound_[id].push_back(index);
    participationLinks_ += distinctRequired.size() + distinctProduced.size();
    directions_.push_back({{reactionId, reverse}, std::move(distinctRequired),
                           std::move(distinctProduced)});
}

AvailabilityResult ReactionDependencyGraph::closure(
        const std::vector<int>& initialCompounds, std::optional<int> target) const {
    if (target && (*target < 0 || static_cast<std::size_t>(*target) >= compoundCount_))
        throw std::invalid_argument("Invalid target compound ID");
    AvailabilityResult result;
    result.targetSpecified = target.has_value();
    result.producerActivation.assign(compoundCount_, -1);
    std::vector<unsigned char> available(compoundCount_, 0);
    std::vector<int> missing;
    missing.reserve(directions_.size());
    for (const auto& direction : directions_)
        missing.push_back(static_cast<int>(direction.required.size()));
    std::queue<int> queue;
    for (int id : initialCompounds) {
        if (id < 0 || static_cast<std::size_t>(id) >= compoundCount_)
            throw std::invalid_argument("Invalid initial compound ID");
        if (available[id]) continue;
        available[id] = 1;
        result.discoveryOrder.push_back(id);
        queue.push(id);
    }
    while (!queue.empty()) {
        const int compound = queue.front();
        queue.pop();
        for (int index : requiredByCompound_[compound]) {
            if (--missing[index] != 0) continue;
            const Direction& direction = directions_[index];
            const int activation = static_cast<int>(result.activationOrder.size());
            result.activationOrder.push_back(direction.descriptor);
            for (int product : direction.produced) {
                if (available[product]) continue;
                available[product] = 1;
                result.producerActivation[product] = activation;
                result.discoveryOrder.push_back(product);
                queue.push(product);
            }
        }
    }
    result.targetAvailable = target && available[*target];
    return result;
}

} // namespace chempath
