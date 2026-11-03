#include "ReactionGraph.hpp"
#include "CSRGraph.hpp"

#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <algorithm>
#include <iostream>
#include <vector>

int main(int argc, char** argv) {
    // Synthetic CSR: degree-zero vertices, multi-edges, stable iteration.
    std::vector<std::vector<chempath::Edge>> src = {
        {{1,10,4},{1,11,2},{2,12,3}}, {}, {{0,13,1}}, {}};
    chempath::CSRGraph csr;
    csr.build(src);
    assert(csr.vertices()==4 && csr.edges()==4);
    assert(csr.neighbors(0).size()==3);
    assert(csr.neighbors(0)[0].reactionId==10);
    assert(csr.neighbors(0)[1].cost==2);
    assert(csr.neighbors(1).empty());
    assert(csr.neighbors(3).empty());
    const auto rebuilt=csr.materialize();
    assert(rebuilt.size()==src.size());
    assert(rebuilt[0].size()==3);
    assert(rebuilt[0][1].reactionId==11);
    if(argc<3) return 1;

    chempath::ReactionGraph a, b;
    a.setBackend(chempath::ReactionGraph::Backend::Adjacency);
    b.setBackend(chempath::ReactionGraph::Backend::CSR);
    assert(a.loadFromFiles(argv[1],argv[2]));
    assert(b.loadFromFiles(argv[1],argv[2]));
    assert(b.backend()==chempath::ReactionGraph::Backend::CSR);
    assert(a.compounds().size()==b.compounds().size());
    assert(a.edgeCount()==b.edgeCount());
    assert(a.graphStorageBytes()>0 && b.graphStorageBytes()>0);
    assert(b.graphStorageBytes()<a.graphStorageBytes());
    for(std::size_t u=0;u<a.compounds().size();++u) {
        const auto old=a.neighbors(static_cast<int>(u));
        const auto compact=b.neighbors(static_cast<int>(u));
        assert(old.size()==compact.size());
        for(std::size_t i=0;i<old.size();++i) {
            assert(old[i].to==compact[i].to);
            assert(old[i].reactionId==compact[i].reactionId);
            assert(old[i].cost==compact[i].cost);
        }
        assert(a.incoming(static_cast<int>(u)).size()==
               b.incoming(static_cast<int>(u)).size());
    }
    // Do not require identical paths for ties, only found/cost/route validity.
    const auto& compounds=a.compounds();
    for(std::size_t i=0;i<compounds.size() && i<35;++i) {
        const auto& from=compounds[i*17%compounds.size()].name;
        const auto& to=compounds[(i*53+29)%compounds.size()].name;
        const auto oldBfs=a.shortestPathBfs(from,to),newBfs=b.shortestPathBfs(from,to);
        const auto oldDij=a.shortestPathDijkstra(from,to),newDij=b.shortestPathDijkstra(from,to);
        const auto oldAStar=a.shortestPathAStar(from,to),newAStar=b.shortestPathAStar(from,to);
        assert(oldBfs.found==newBfs.found && oldBfs.totalCost==newBfs.totalCost);
        assert(oldDij.found==newDij.found && oldDij.totalCost==newDij.totalCost);
        assert(oldAStar.found==newAStar.found && oldAStar.totalCost==newAStar.totalCost);
        if(newDij.found)assert(newDij.reactionIds.size()+1==newDij.compoundIds.size());
    }
    // Trigger lazy compatibility materialization; verify it matches.
    const auto& fallback=b.adjacency();
    assert(fallback.size()==a.adjacency().size());
    assert(fallback[0].size()==a.adjacency()[0].size());
    std::cout<<"CSR reference backend equivalence OK\n";
}
