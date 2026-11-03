#pragma once
#include "ReactionGraph.hpp"
#include <cstddef>
#include <string>
#include <unordered_set>
#include <vector>

namespace chempath {

struct RouteConstraints {
    std::unordered_set<int> blockedReactionIds;
    std::unordered_set<int> blockedCompoundIds;
    std::unordered_set<std::string> availableReagents;
    std::unordered_set<std::string> availableCatalysts;
    // Unknown source metadata is not proof a reaction has no requirements.
    bool allowUnknownRequirements{true};
};

struct ConstrainedRoutes {
    std::vector<PathResult> routes;
    std::size_t knownRequirementReactions{0};
    std::size_t totalReactions{0};
    bool unknownRequirementsAllowed{true};
};

class ConstrainedSearch {
public:
    static bool allows(const ReactionGraph& graph, int reactionId,
                       const RouteConstraints& constraints);
    static ConstrainedRoutes kShortest(const ReactionGraph& graph,
                                      const std::string& from,
                                      const std::string& to,
                                      const RouteConstraints& constraints,
                                      std::size_t k = 3);
};

} // namespace chempath
