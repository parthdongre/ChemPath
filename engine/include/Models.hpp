#pragma once

#include <string>
#include <vector>

namespace chempath {

struct Compound {
    int id{};
    std::string name;
    std::string formula;
    std::string category;
};

struct Reaction {
    int id{};
    std::string name;
    std::vector<int> reactants;
    std::vector<int> products;
    std::string equation;
    std::string conditions;
    std::string note;
    std::string sourceKey;
    int cost{1};
};

struct Edge {
    int to{};
    int reactionId{};
    int cost{1};
};

struct PathSegment {
    int from{};
    int to{};
    int reactionId{};
};

struct PathResult {
    bool found{false};
    std::vector<int> compoundIds;
    std::vector<int> reactionIds;
    std::vector<int> visitedOrder;
    int totalCost{0};
};

struct SccResult {
    std::vector<std::vector<int>> components;
    std::vector<int> visitedOrder;
};

} // namespace chempath
