#pragma once

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace chempath {

class Trie {
public:
    Trie();

    void insert(const std::string& key, int compoundId);
    std::vector<int> searchPrefix(const std::string& prefix, std::size_t limit = 8) const;

private:
    struct Node {
        std::unordered_map<char, std::unique_ptr<Node>> children;
        std::vector<int> terminalIds;
    };

    std::unique_ptr<Node> root_;

    static std::string normalize(const std::string& value);
    static void collect(const Node* node, std::vector<int>& out, std::size_t limit);
};

} // namespace chempath
