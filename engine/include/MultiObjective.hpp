#pragma once
#include "ReactionGraph.hpp"
#include <cstddef>
#include <vector>

namespace chempath {

struct ParetoOptions {
    bool includeReagentOccurrences{false};
    std::size_t maxTotalLabels{50000};
    std::size_t maxLabelsPerVertex{512};
    std::size_t maxReturnedRoutes{15};
};

struct ParetoRoute {
    PathResult path;
    int steps{0};
    int graphCost{0};
    // Counts reagent *occurrences per reaction*, not unique reagent names.
    int knownReagentOccurrences{0};
};

struct ParetoResult {
    std::vector<ParetoRoute> routes;
    std::size_t nonDominatedTargetLabels{0};
    std::size_t labelsGenerated{0};
    std::size_t labelsExpanded{0};
    std::size_t skippedUnknownRequirements{0};
    bool complete{true};    // false if resource/label budget was hit
    bool routesOmitted{false};
    bool reagentObjective{false};
};

class MultiObjective {
public:
    // Nonnegative additive objectives: (#steps, total cost[, known reagents]).
    // Three-objective mode excludes all records missing structured requirements.
    static ParetoResult search(const ReactionGraph& graph,
                               const std::string& from, const std::string& to,
                               const ParetoOptions& options = {});
};

} // namespace chempath
