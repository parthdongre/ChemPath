#pragma once

#include "Models.hpp"
#include <cstddef>
#include <optional>
#include <vector>

namespace chempath {

// Reaction-level AND dependencies, independent of the legacy compound graph.
// A reaction becomes available only after ALL distinct required compounds are
// available. Compounds are treated as reusable; quantity and stoichiometry are
// not modeled by this reachability closure.
struct ReactionActivation {
    int reactionId{};
    bool reverse{false};
};

struct AvailabilityResult {
    bool targetSpecified{false};
    bool targetAvailable{false};
    std::vector<int> discoveryOrder;
    std::vector<ReactionActivation> activationOrder;
    // -1 for seeds or undiscovered compounds; otherwise activationOrder index.
    std::vector<int> producerActivation;
};

class ReactionDependencyGraph {
public:
    ReactionDependencyGraph(std::size_t compoundCount,
                            const std::vector<Reaction>& reactions);
    AvailabilityResult closure(const std::vector<int>& initialCompounds,
                               std::optional<int> target = std::nullopt) const;
    std::size_t reactionDirections() const { return directions_.size(); }
    std::size_t participationLinks() const { return participationLinks_; }

private:
    struct Direction {
        ReactionActivation descriptor;
        std::vector<int> required;
        std::vector<int> produced;
    };
    std::size_t compoundCount_{};
    std::size_t participationLinks_{};
    std::vector<Direction> directions_;
    std::vector<std::vector<int>> requiredByCompound_;

    void addDirection(int reactionId, bool reverse,
                      const std::vector<int>& required,
                      const std::vector<int>& produced);
};

} // namespace chempath
