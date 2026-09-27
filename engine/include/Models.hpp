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
    std::string note;
};

struct Edge {
    int to{};
    int reactionId{};
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
};

} // namespace chempath
