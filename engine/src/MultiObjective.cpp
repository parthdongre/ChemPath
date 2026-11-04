#include "MultiObjective.hpp"

#include <algorithm>
#include <array>
#include <functional>
#include <limits>
#include <queue>
#include <stdexcept>
#include <utility>

namespace chempath {
namespace {
constexpr int INF = std::numeric_limits<int>::max()/4;

struct Label {
    int vertex{};
    int steps{};
    int cost{};
    int requirements{};
    int parent{-1}; // global immutable index, survives frontier pruning
    int reaction{-1};
    bool active{true};
};
bool weaklyDominates(const Label& a,const Label& b,bool useReagents) {
    return a.steps<=b.steps && a.cost<=b.cost &&
           (!useReagents || a.requirements<=b.requirements);
}
ParetoRoute reconstruct(const std::vector<Label>& labels,int id) {
    ParetoRoute result;
    const auto& finish=labels[id];
    result.steps=finish.steps;
    result.graphCost=finish.cost;
    result.knownReagentOccurrences=finish.requirements;
    result.path.found=true;
    result.path.totalCost=finish.cost;
    // Parent-chain references are immutable even if old Pareto labels
    // were later marked inactive. Required for valid route reconstruction.
    for(int cursor=id;cursor>=0;cursor=labels[cursor].parent) {
        const auto& state=labels[cursor];
        result.path.compoundIds.push_back(state.vertex);
        if(state.reaction>=0) result.path.reactionIds.push_back(state.reaction);
    }
    std::reverse(result.path.compoundIds.begin(),result.path.compoundIds.end());
    std::reverse(result.path.reactionIds.begin(),result.path.reactionIds.end());
    return result;
}
}

ParetoResult MultiObjective::search(const ReactionGraph& graph,
                                   const std::string& from,const std::string& to,
                                   const ParetoOptions& options) {
    if(options.maxTotalLabels==0 || options.maxLabelsPerVertex==0 ||
       options.maxReturnedRoutes==0 ||
       options.maxTotalLabels>static_cast<std::size_t>(std::numeric_limits<int>::max()))
        throw std::invalid_argument("Invalid Pareto label limits");
    ParetoResult result;
    result.reagentObjective=options.includeReagentOccurrences;
    const auto source=graph.compoundId(from),target=graph.compoundId(to);
    if(!source||!target) return result;
    const std::size_t n=graph.compounds().size();
    std::vector<std::vector<int>> frontier(n);
    std::vector<Label> labels;
    labels.reserve(std::min(options.maxTotalLabels,static_cast<std::size_t>(4096)));
    labels.push_back({*source,0,0,0,-1,-1,true});
    frontier[*source].push_back(0);
    // Lexicographic queue ordering is deterministic and nondecreasing because
    // every edge increases steps and has nonnegative graph/reagent costs.
    using Item = std::array<int,4>; // steps,cost,reagents,label ID
    std::priority_queue<Item,std::vector<Item>,std::greater<Item>> queue;
    queue.push({0,0,0,0});
    bool overBudget=false;
    while(!queue.empty() && !overBudget) {
        const int id=queue.top()[3];
        queue.pop();
        if(!labels[id].active) continue;
        const Label current=labels[id]; // copy: labels may reallocate
        ++result.labelsExpanded;
        for(const Edge& e:graph.neighbors(current.vertex)) {
            if(e.cost<0 || e.cost>=INF || current.cost>INF-e.cost ||
               current.steps>=INF-1) continue;
            const Reaction* reaction=graph.reaction(e.reactionId);
            if(!reaction) continue;
            if(options.includeReagentOccurrences && !reaction->requirementsKnown) {
                ++result.skippedUnknownRequirements;
                continue;
            }
            const std::size_t reagentCount=options.includeReagentOccurrences ?
                reaction->requiredReagents.size() : 0;
            if(reagentCount>static_cast<std::size_t>(INF) ||
               current.requirements>INF-static_cast<int>(reagentCount)) continue;
            Label candidate{e.to,current.steps+1,current.cost+e.cost,
                            current.requirements+static_cast<int>(reagentCount),
                            id,e.reactionId,true};

            auto& stored=frontier[e.to];
            bool dominated=false;
            for(int oldId:stored) {
                if(weaklyDominates(labels[oldId],candidate,options.includeReagentOccurrences)) {
                    dominated=true;break;
                }
            }
            if(dominated) continue;
            // Budget hits are explicit: do not claim an exact frontier.
            if(labels.size()>=options.maxTotalLabels ||
               stored.size()>=options.maxLabelsPerVertex) {
                result.complete=false;
                overBudget=true;
                break;
            }
            for(int oldId:stored)
                if(weaklyDominates(candidate,labels[oldId],options.includeReagentOccurrences))
                    labels[oldId].active=false;
            stored.erase(std::remove_if(stored.begin(),stored.end(),
                    [&](int oldId){return !labels[oldId].active;}),stored.end());
            const int next=static_cast<int>(labels.size());
            labels.push_back(candidate);
            stored.push_back(next);
            queue.push({candidate.steps,candidate.cost,candidate.requirements,next});
        }
    }
    result.labelsGenerated=labels.size();
    auto ids=frontier[*target];
    std::sort(ids.begin(),ids.end(),[&](int a,int b){
        const Label& x=labels[a],&y=labels[b];
        if(x.steps!=y.steps) return x.steps<y.steps;
        if(x.cost!=y.cost) return x.cost<y.cost;
        if(x.requirements!=y.requirements) return x.requirements<y.requirements;
        return a<b;
    });
    result.nonDominatedTargetLabels=ids.size();
    result.routesOmitted=ids.size()>options.maxReturnedRoutes;
    for(std::size_t i=0;i<ids.size() && i<options.maxReturnedRoutes;++i)
        result.routes.push_back(reconstruct(labels,ids[i]));
    return result;
}
} // namespace chempath
