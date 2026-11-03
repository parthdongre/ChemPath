#include "ConstrainedSearch.hpp"

#include <algorithm>
#include <functional>
#include <limits>
#include <queue>
#include <set>
#include <tuple>
#include <utility>

namespace chempath {
namespace {
using BlockedEdge = std::tuple<int,int,int>;
constexpr int INF = std::numeric_limits<int>::max() / 4;

PathResult filteredDijkstra(const ReactionGraph& graph, int source, int target,
                            const RouteConstraints& filter,
                            const std::set<int>& spurBlockedVertices,
                            const std::set<BlockedEdge>& spurBlockedEdges) {
    PathResult result;
    const int n = static_cast<int>(graph.compounds().size());
    if (source < 0 || target < 0 || source >= n || target >= n ||
        filter.blockedCompoundIds.count(source) || filter.blockedCompoundIds.count(target) ||
        spurBlockedVertices.count(source) || spurBlockedVertices.count(target)) return result;

    std::vector<int> dist(n, INF), parent(n,-1), parentReaction(n,-1);
    using Item = std::pair<int,int>;
    std::priority_queue<Item,std::vector<Item>,std::greater<Item>> pq;
    dist[source] = 0;
    pq.push({0,source});
    while(!pq.empty()) {
        const auto [cost,u] = pq.top();
        pq.pop();
        if(cost != dist[u]) continue;
        result.visitedOrder.push_back(u);
        if(u == target) break;
        for(const Edge& edge:graph.neighbors(u)) {
            if(filter.blockedCompoundIds.count(edge.to) ||
               spurBlockedVertices.count(edge.to) ||
               spurBlockedEdges.count({u,edge.to,edge.reactionId}) ||
               !ConstrainedSearch::allows(graph,edge.reactionId,filter)) continue;
            if(edge.cost <= 0 || cost > INF - edge.cost) continue;
            const int next = cost + edge.cost;
            if(next >= dist[edge.to]) continue;
            dist[edge.to] = next;
            parent[edge.to] = u;
            parentReaction[edge.to] = edge.reactionId;
            pq.push({next,edge.to});
        }
    }
    if(dist[target]==INF) return result;
    result.found = true;
    result.totalCost = dist[target];
    for(int at=target;at!=-1;at=parent[at]) {
        result.compoundIds.push_back(at);
        if(parentReaction[at]>=0) result.reactionIds.push_back(parentReaction[at]);
    }
    std::reverse(result.compoundIds.begin(),result.compoundIds.end());
    std::reverse(result.reactionIds.begin(),result.reactionIds.end());
    return result;
}

int rootCost(const ReactionGraph& graph,const PathResult& path,std::size_t count) {
    int result=0;
    for(std::size_t j=0;j<count;++j) {
        for(const Edge& e:graph.neighbors(path.compoundIds[j])) {
            if(e.to == path.compoundIds[j+1] && e.reactionId == path.reactionIds[j]) {
                result += e.cost;
                break;
            }
        }
    }
    return result;
}
}

bool ConstrainedSearch::allows(const ReactionGraph& graph, int reactionId,
                               const RouteConstraints& constraints) {
    if (constraints.blockedReactionIds.count(reactionId)) return false;
    const Reaction* reaction = graph.reaction(reactionId);
    if (!reaction) return false;
    if (!reaction->requirementsKnown) return constraints.allowUnknownRequirements;
    for (const auto& r:reaction->requiredReagents)
        if (!constraints.availableReagents.count(r)) return false;
    for (const auto& c:reaction->requiredCatalysts)
        if (!constraints.availableCatalysts.count(c)) return false;
    return true;
}

ConstrainedRoutes ConstrainedSearch::kShortest(
    const ReactionGraph& graph,const std::string& from,const std::string& to,
    const RouteConstraints& constraints,std::size_t k) {
    ConstrainedRoutes out;
    out.totalReactions=graph.reactions().size();
    out.unknownRequirementsAllowed=constraints.allowUnknownRequirements;
    for(const auto& reaction:graph.reactions())
        if(reaction.requirementsKnown) ++out.knownRequirementReactions;
    if(k==0 || k>10) return out;
    const auto start=graph.compoundId(from),target=graph.compoundId(to);
    if(!start||!target) return out;
    PathResult first=filteredDijkstra(graph,*start,*target,constraints,{},{});
    if(!first.found) return out;
    out.routes.push_back(std::move(first));

    std::vector<PathResult> candidates;
    auto signature=[](const PathResult& p) {
        return std::make_pair(p.compoundIds,p.reactionIds);
    };
    for(std::size_t rank=1;rank<k;++rank) {
        const auto& previous=out.routes.back();
        for(std::size_t spurIndex=0;spurIndex+1<previous.compoundIds.size();++spurIndex) {
            std::vector<int> root(previous.compoundIds.begin(),
                                  previous.compoundIds.begin()+spurIndex+1);
            std::vector<int> rootReactions(previous.reactionIds.begin(),
                                          previous.reactionIds.begin()+spurIndex);
            std::set<int> excludedVertices(root.begin(),root.end()-1);
            std::set<BlockedEdge> excludedEdges;
            for(const auto& route:out.routes) {
                if(route.compoundIds.size()>spurIndex+1 &&
                   std::equal(root.begin(),root.end(),route.compoundIds.begin()) &&
                   std::equal(rootReactions.begin(),rootReactions.end(),route.reactionIds.begin()))
                    excludedEdges.insert({route.compoundIds[spurIndex],
                                          route.compoundIds[spurIndex+1],
                                          route.reactionIds[spurIndex]});
            }
            auto spur=filteredDijkstra(graph,root.back(),*target,constraints,
                                      excludedVertices,excludedEdges);
            if(!spur.found) continue;
            PathResult combined;
            combined.found=true;
            combined.totalCost=rootCost(graph,previous,spurIndex)+spur.totalCost;
            combined.compoundIds=std::move(root);
            combined.compoundIds.insert(combined.compoundIds.end(),
                                       spur.compoundIds.begin()+1,spur.compoundIds.end());
            combined.reactionIds=std::move(rootReactions);
            combined.reactionIds.insert(combined.reactionIds.end(),
                                       spur.reactionIds.begin(),spur.reactionIds.end());
            const auto key=signature(combined);
            auto same=[&](const PathResult& p){return signature(p)==key;};
            if(std::any_of(out.routes.begin(),out.routes.end(),same) ||
               std::any_of(candidates.begin(),candidates.end(),same)) continue;
            candidates.push_back(std::move(combined));
        }
        if(candidates.empty()) break;
        std::sort(candidates.begin(),candidates.end(),[](const PathResult& a,const PathResult& b){
            if(a.totalCost!=b.totalCost) return a.totalCost<b.totalCost;
            if(a.compoundIds!=b.compoundIds) return a.compoundIds<b.compoundIds;
            return a.reactionIds<b.reactionIds;
        });
        out.routes.push_back(std::move(candidates.front()));
        candidates.erase(candidates.begin());
    }
    return out;
}
} // namespace chempath
