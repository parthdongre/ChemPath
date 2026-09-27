#include "Trie.hpp"

#include <algorithm>
#include <cctype>

namespace chempath {

Trie::Trie() : root_(std::make_unique<Node>()) {}

std::string Trie::normalize(const std::string& value) {
    std::string out;
    out.reserve(value.size());
    for (unsigned char ch : value) {
        out.push_back(static_cast<char>(std::tolower(ch)));
    }
    return out;
}

void Trie::insert(const std::string& key, int compoundId) {
    Node* current = root_.get();
    for (char ch : normalize(key)) {
        auto& next = current->children[ch];
        if (!next) {
            next = std::make_unique<Node>();
        }
        current = next.get();
    }
    current->terminalIds.push_back(compoundId);
}

void Trie::collect(const Node* node, std::vector<int>& out, std::size_t limit) {
    if (!node || out.size() >= limit) return;

    for (int id : node->terminalIds) {
        if (out.size() >= limit) return;
        out.push_back(id);
    }

    std::vector<char> keys;
    keys.reserve(node->children.size());
    for (const auto& [key, _] : node->children) {
        keys.push_back(key);
    }
    std::sort(keys.begin(), keys.end());

    for (char key : keys) {
        if (out.size() >= limit) return;
        collect(node->children.at(key).get(), out, limit);
    }
}

std::vector<int> Trie::searchPrefix(const std::string& prefix, std::size_t limit) const {
    const Node* current = root_.get();
    for (char ch : normalize(prefix)) {
        const auto it = current->children.find(ch);
        if (it == current->children.end()) {
            return {};
        }
        current = it->second.get();
    }

    std::vector<int> matches;
    collect(current, matches, limit);
    return matches;
}

} // namespace chempath
