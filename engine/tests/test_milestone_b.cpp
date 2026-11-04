#include "ReactionGraph.hpp"
#include "ConstrainedSearch.hpp"
#include "MultiObjective.hpp"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <algorithm>
#include <iostream>
#include <functional>
#include <utility>
#include <vector>

using namespace chempath;

int main(int argc,char** argv) {
    if(argc<2) return 2;
    const std::string dir=argv[1];
    ReactionGraph csr,adj;
    adj.setBackend(ReactionGraph::Backend::Adjacency);
    assert(csr.loadFromFiles(dir+"/compounds.csv",dir+"/reactions.csv"));
    assert(adj.loadFromFiles(dir+"/compounds.csv",dir+"/reactions.csv"));
    assert(csr.backend()==ReactionGraph::Backend::CSR);
    assert(csr.shortestPathDijkstra("A","D").totalCost==6);
    assert(adj.shortestPathDijkstra("A","D").totalCost==6);
    for(int i=0;i<6;++i)assert(csr.neighbors(i).size()==adj.neighbors(i).size());

    RouteConstraints any;
    auto all=ConstrainedSearch::kShortest(csr,"A","D",any,4);
    assert(all.totalReactions==8 && all.knownRequirementReactions==8);
    assert(all.routes.size()==3);
    assert(all.routes[0].totalCost==6);
    // B->D requires reagent and catalyst, unavailable by default.
    assert(all.routes[1].totalCost==13);
    assert(all.routes[2].totalCost==15);
    // With metadata satisfied, the A->B->D route costs 11.
    any.availableReagents.insert("water");
    any.availableCatalysts.insert("platinum");
    all=ConstrainedSearch::kShortest(csr,"A","D",any,4);
    assert(all.routes.size()==4 && all.routes[1].totalCost==11);
    any.blockedReactionIds.insert(3);
    auto filtered=ConstrainedSearch::kShortest(csr,"A","D",any,3);
    assert(filtered.routes.size()==3 && filtered.routes[0].totalCost==11);
    any.blockedCompoundIds.insert(1);
    filtered=ConstrainedSearch::kShortest(csr,"A","D",any,3);
    assert(filtered.routes[0].totalCost==13);
    assert(ConstrainedSearch::kShortest(csr,"invalid","D",any,3).routes.empty());
    RouteConstraints strict;
    strict.allowUnknownRequirements=false;
    assert(ConstrainedSearch::kShortest(csr,"A","D",strict,1).routes.size()==1);
    const auto same=ConstrainedSearch::kShortest(csr,"A","A",any,1);
    assert(same.routes.size()==1 && same.routes[0].totalCost==0);

    ParetoOptions opt;
    auto pareto=MultiObjective::search(csr,"A","D",opt);
    assert(pareto.complete && !pareto.routesOmitted);
    assert(pareto.nonDominatedTargetLabels==3);
    assert(pareto.routes.size()==3);
    assert(pareto.routes[0].steps==1 && pareto.routes[0].graphCost==15);
    assert(pareto.routes[1].steps==2 && pareto.routes[1].graphCost==11);
    assert(pareto.routes[2].steps==3 && pareto.routes[2].graphCost==6);
    // Independent brute-force enumeration of ALL loopless paths on this small
    // fixture, then Pareto-filter by (steps, weight). The result must agree.
    std::vector<std::pair<int,int>> brute;
    std::vector<bool> onPath(csr.compounds().size(),false);
    std::function<void(int,int,int)> visit=[&](int u,int steps,int cost) {
        if(u==3) { brute.push_back({steps,cost}); return; }
        onPath[u]=true;
        for(const auto& edge:csr.neighbors(u)) {
            if(!onPath[edge.to])visit(edge.to,steps+1,cost+edge.cost);
        }
        onPath[u]=false;
    };
    visit(0,0,0);
    std::vector<std::pair<int,int>> bruteFront;
    for(const auto& candidate:brute) {
        bool dominated=false;
        for(const auto& other:brute) {
            if(other.first<=candidate.first && other.second<=candidate.second &&
               (other.first<candidate.first || other.second<candidate.second)) {
                dominated=true; break;
            }
        }
        if(!dominated)bruteFront.push_back(candidate);
    }
    std::sort(bruteFront.begin(),bruteFront.end());
    std::vector<std::pair<int,int>> actual;
    for(const auto& route:pareto.routes)actual.push_back({route.steps,route.graphCost});
    std::sort(actual.begin(),actual.end());
    assert(actual==bruteFront);
    opt.includeReagentOccurrences=true;
    const auto reagentPareto=MultiObjective::search(csr,"A","D",opt);
    assert(reagentPareto.complete);
    assert(reagentPareto.routes.size()==4);
    assert(reagentPareto.routes[1].knownReagentOccurrences==1);
    assert(reagentPareto.routes[2].knownReagentOccurrences==0);
    opt.includeReagentOccurrences=false;
    opt.maxTotalLabels=1;
    const auto bounded=MultiObjective::search(csr,"A","D",opt);
    assert(!bounded.complete);
    opt.maxTotalLabels=50000;
    opt.maxReturnedRoutes=1;
    const auto cut=MultiObjective::search(csr,"A","D",opt);
    assert(cut.complete && cut.routesOmitted);
    assert(cut.nonDominatedTargetLabels==3 && cut.routes.size()==1);
    std::cout<<"Milestone B CSR, constraints, and Pareto tests passed\n";
}
