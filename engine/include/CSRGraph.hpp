#pragma once
#include "Models.hpp"
#include <cstddef>
#include <iterator>
#include <stdexcept>
#include <vector>

namespace chempath {

// A small C++17 read-only neighbor range (std::span requires C++20).
struct EdgeRange {
    const Edge* first{};
    const Edge* last{};
    const Edge* begin() const { return first; }
    const Edge* end() const { return last; }
    std::reverse_iterator<const Edge*> rbegin() const { return std::reverse_iterator<const Edge*>(last); }
    std::reverse_iterator<const Edge*> rend() const { return std::reverse_iterator<const Edge*>(first); }
    std::size_t size() const { return static_cast<std::size_t>(last - first); }
    bool empty() const { return first == last; }
    const Edge& operator[](std::size_t i) const { if (i >= size()) throw std::out_of_range("EdgeRange"); return first[i]; }
};

class CSRGraph {
public:
    void build(const std::vector<std::vector<Edge>>& adjacency);
    EdgeRange neighbors(std::size_t vertex) const;
    std::vector<std::vector<Edge>> materialize() const;
    std::size_t vertices() const { return offsets_.empty() ? 0 : offsets_.size() - 1; }
    std::size_t edges() const { return edges_.size(); }
    std::size_t storageBytes() const {
        return offsets_.capacity() * sizeof(std::size_t) +
               edges_.capacity() * sizeof(Edge);
    }

private:
    std::vector<std::size_t> offsets_;
    std::vector<Edge> edges_;
};

} // namespace chempath
