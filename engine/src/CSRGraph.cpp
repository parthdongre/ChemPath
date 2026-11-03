#include "CSRGraph.hpp"
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace chempath {

void CSRGraph::build(const std::vector<std::vector<Edge>>& adjacency) {
    if (adjacency.size() >= std::numeric_limits<std::size_t>::max() - 1)
        throw std::length_error("CSR vertex overflow");
    offsets_.assign(adjacency.size() + 1, 0);
    for (std::size_t u = 0; u < adjacency.size(); ++u) {
        if (adjacency[u].size() > std::numeric_limits<std::size_t>::max() - offsets_[u])
            throw std::length_error("CSR edge overflow");
        offsets_[u + 1] = offsets_[u] + adjacency[u].size();
    }
    edges_.clear();
    edges_.reserve(offsets_.back());
    for (const auto& neighborhood : adjacency)
        edges_.insert(edges_.end(), neighborhood.begin(), neighborhood.end());
}

EdgeRange CSRGraph::neighbors(std::size_t vertex) const {
    if (vertex >= vertices()) throw std::out_of_range("CSR vertex out of bounds");
    // Pointer difference on nullptr is undefined; use an actual object for
    // empty ranges (including graphs with zero edges).
    static const Edge sentinel{};
    if (edges_.empty()) return {&sentinel, &sentinel};
    const Edge* start = edges_.data() + offsets_[vertex];
    return {start, start + (offsets_[vertex + 1] - offsets_[vertex])};
}

std::vector<std::vector<Edge>> CSRGraph::materialize() const {
    std::vector<std::vector<Edge>> out(vertices());
    for (std::size_t u = 0; u < out.size(); ++u) {
        const auto span = neighbors(u);
        out[u].assign(span.begin(), span.end());
    }
    return out;
}

} // namespace chempath
