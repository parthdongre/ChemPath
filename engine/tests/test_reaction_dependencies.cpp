#include "ReactionDependencyGraph.hpp"
#include <algorithm>
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <stdexcept>
#include <vector>

using chempath::Reaction;
using chempath::ReactionDependencyGraph;

static Reaction make(int id, std::vector<int> inputs, std::vector<int> outputs,
                     bool reversible = false) {
    Reaction r;
    r.id = id;
    r.reactants = std::move(inputs);
    r.products = std::move(outputs);
    r.reversible = reversible;
    return r;
}

int main() {
    // A+B -> C; C -> D. A alone cannot activate either reaction.
    ReactionDependencyGraph g(6, {make(10,{0,1},{2}), make(11,{2},{3})});
    assert(!g.closure({0}, 2).targetAvailable);
    assert(!g.closure({0}, 3).targetAvailable);
    auto both = g.closure({0,1}, 3);
    assert(both.targetAvailable);
    assert(both.activationOrder.size() == 2);
    assert(both.activationOrder[0].reactionId == 10);
    assert(both.activationOrder[1].reactionId == 11);
    assert(both.producerActivation[3] == 1);
    assert(g.closure({3}, 3).targetAvailable);
    assert(g.closure({0,0,1}, 3).discoveryOrder.size() == 4);

    // Duplicates do not count as separate requirements.
    ReactionDependencyGraph dup(3, {make(20,{0,0,1},{2,2})});
    assert(dup.closure({0,1},2).targetAvailable);
    assert(!dup.closure({0},2).targetAvailable);
    assert(dup.participationLinks()==3);

    // Reversible reaction has full AND-dependency in BOTH directions.
    ReactionDependencyGraph reversible(4,{make(30,{0,1},{2,3},true)});
    assert(reversible.reactionDirections()==2);
    assert(!reversible.closure({2},0).targetAvailable);
    assert(reversible.closure({2,3},0).targetAvailable);
    assert(reversible.closure({0,1},2).targetAvailable);

    // Closed cycle without a starting reactant is not spontaneously activated.
    ReactionDependencyGraph cycle(3,{make(40,{0},{1}),make(41,{1},{0})});
    assert(cycle.closure({2},1).activationOrder.empty());
    assert(!cycle.closure({},1).targetAvailable);

    // No mutable closure state leaks between searches.
    assert(!g.closure({0},3).targetAvailable);
    assert(g.closure({0,1},3).targetAvailable);
    assert(!g.closure({0},3).targetAvailable);

    // Validate seed and reaction references instead of accessing bad offsets.
    bool threw=false;
    try { (void)g.closure({9}); } catch(const std::invalid_argument&){ threw=true; }
    assert(threw);
    threw=false;
    try { ReactionDependencyGraph bad(2, {make(5,{0,5},{1})}); }
    catch(const std::invalid_argument&){ threw=true; }
    assert(threw);
}
