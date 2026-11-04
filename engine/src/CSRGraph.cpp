#include "CSRGraph.hpp"
#include <algorithm>
#include <cstdint>
#include <fstream>
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

namespace {
constexpr std::uint64_t FNV_OFFSET = 14695981039346656037ULL;
constexpr std::uint64_t FNV_PRIME = 1099511628211ULL;
constexpr std::uint32_t FILE_VERSION = 1;
constexpr std::uint64_t HEADER_BYTES = 32;

void hashLE(std::uint64_t& hash,std::uint64_t value,int bytes) {
    for(int i=0;i<bytes;++i) {
        hash ^= (value & 255U);
        hash *= FNV_PRIME;
        value >>= 8;
    }
}
void writeLE(std::ostream& out,std::uint64_t value,int bytes) {
    for(int i=0;i<bytes;++i) {
        out.put(static_cast<char>(value & 255U));
        value >>= 8;
    }
}
bool readLE(std::istream& in,std::uint64_t& value,int bytes) {
    value=0;
    for(int i=0;i<bytes;++i) {
        const int ch=in.get();
        if(ch==std::char_traits<char>::eof()) return false;
        value |= static_cast<std::uint64_t>(static_cast<unsigned char>(ch)) << (i*8);
    }
    return true;
}
}

bool CSRGraph::save(const std::string& filename) const {
    if(offsets_.empty() || offsets_.back()!=edges_.size()) return false;
    if(vertices() > static_cast<std::size_t>(std::numeric_limits<std::uint32_t>::max()) ||
       edges_.size() > static_cast<std::size_t>(std::numeric_limits<std::uint32_t>::max()))
        return false;
    std::uint64_t checksum=FNV_OFFSET;
    for(std::size_t offset:offsets_) hashLE(checksum,offset,8);
    for(const Edge& edge:edges_) {
        if(edge.to<0 || static_cast<std::size_t>(edge.to)>=vertices() ||
           edge.reactionId<0 || edge.cost<=0) return false;
        hashLE(checksum,static_cast<std::uint32_t>(edge.to),4);
        hashLE(checksum,static_cast<std::uint32_t>(edge.reactionId),4);
        hashLE(checksum,static_cast<std::uint32_t>(edge.cost),4);
    }
    std::ofstream out(filename,std::ios::binary|std::ios::trunc);
    if(!out) return false;
    out.write("CPG1",4);
    writeLE(out,FILE_VERSION,4);
    writeLE(out,vertices(),8);
    writeLE(out,edges_.size(),8);
    writeLE(out,checksum,8);
    for(std::size_t offset:offsets_) writeLE(out,offset,8);
    for(const Edge& edge:edges_) {
        writeLE(out,static_cast<std::uint32_t>(edge.to),4);
        writeLE(out,static_cast<std::uint32_t>(edge.reactionId),4);
        writeLE(out,static_cast<std::uint32_t>(edge.cost),4);
    }
    return out.good();
}

bool CSRGraph::load(const std::string& filename) {
    std::ifstream in(filename,std::ios::binary|std::ios::ate);
    if(!in) return false;
    const std::streampos actual=in.tellg();
    if(actual < std::streampos(0)) return false;
    in.seekg(0);
    char magic[4]{};
    if(!in.read(magic,4) || std::string(magic,4)!="CPG1") return false;
    std::uint64_t version=0,n=0,e=0,want=0;
    if(!readLE(in,version,4) || !readLE(in,n,8) ||
       !readLE(in,e,8) || !readLE(in,want,8) || version!=FILE_VERSION)
        return false;
    // Bound input allocation and validate exact expected format size.
    if(n>100000000ULL || e>500000000ULL) return false;
    const std::uint64_t expected=HEADER_BYTES+8*(n+1)+12*e;
    if(static_cast<std::uint64_t>(actual)!=expected) return false;
    std::vector<std::size_t> offsets(n+1,0);
    std::vector<Edge> edges;
    edges.reserve(static_cast<std::size_t>(e));
    std::uint64_t checksum=FNV_OFFSET;
    for(std::size_t i=0;i<offsets.size();++i) {
        std::uint64_t value=0;
        if(!readLE(in,value,8) || value>e) return false;
        offsets[i]=static_cast<std::size_t>(value);
        hashLE(checksum,value,8);
        if(i>0 && offsets[i]<offsets[i-1]) return false;
    }
    if(offsets.front()!=0 || offsets.back()!=e) return false;
    for(std::uint64_t i=0;i<e;++i) {
        std::uint64_t to=0,reaction=0,cost=0;
        if(!readLE(in,to,4) || !readLE(in,reaction,4) || !readLE(in,cost,4))
            return false;
        if(to>=n || to>static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
           reaction>static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
           cost==0 || cost>static_cast<std::uint64_t>(std::numeric_limits<int>::max()))
            return false;
        hashLE(checksum,to,4);
        hashLE(checksum,reaction,4);
        hashLE(checksum,cost,4);
        edges.push_back({static_cast<int>(to),
                         static_cast<int>(reaction),static_cast<int>(cost)});
    }
    if(checksum!=want) return false;
    offsets_.swap(offsets);
    edges_.swap(edges);
    return true;
}

} // namespace chempath
