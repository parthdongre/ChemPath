#include "Lab.hpp"

#include <algorithm>
#include <chrono>
#include <deque>
#include <functional>
#include <limits>
#include <numeric>
#include <optional>
#include <queue>
#include <random>
#include <set>
#include <stack>
#include <tuple>
#include <unordered_set>

namespace chempath::lab {
namespace {
constexpr int INF = std::numeric_limits<int>::max() / 4;
using BlockedEdge = std::tuple<int, int, int>;

PathResult filteredPath(const ReactionGraph& graph, int start, int target,
                        const std::set<int>& blockedNodes,
                        const std::set<BlockedEdge>& blockedEdges,
                        const std::optional<std::tuple<int,int,int,int>>& injected = std::nullopt) {
    PathResult result;
    const auto& adj = graph.adjacency();
    if (start < 0 || target < 0 || start >= static_cast<int>(adj.size()) ||
        target >= static_cast<int>(adj.size()) ||
        blockedNodes.count(start) || blockedNodes.count(target)) return result;
    const int n = static_cast<int>(adj.size());
    std::vector<int> dist(n, INF), parent(n, -1), reaction(n, -1);
    using State = std::pair<int,int>;
    std::priority_queue<State, std::vector<State>, std::greater<State>> heap;
    dist[start] = 0;
    heap.push({0,start});
    while (!heap.empty()) {
        const auto [cost,node] = heap.top(); heap.pop();
        if (cost != dist[node]) continue;
        result.visitedOrder.push_back(node);
        if (node == target) break;
        const auto relax = [&](int destination,int reactionId,int weight) {
            if (blockedNodes.count(destination) || cost > INF-weight) return;
            const int candidate = cost + weight;
            if (candidate < dist[destination]) {
                dist[destination] = candidate;
                parent[destination] = node;
                reaction[destination] = reactionId;
                heap.push({candidate,destination});
            }
        };
        for (const auto& e : adj[node]) {
            if (blockedEdges.count({node,e.to,e.reactionId})) continue;
            relax(e.to,e.reactionId,e.cost);
        }
        if (injected && std::get<0>(*injected)==node) {
            relax(std::get<1>(*injected),std::get<2>(*injected),std::get<3>(*injected));
        }
    }
    if (dist[target] == INF) return result;
    result.found = true;
    result.totalCost = dist[target];
    for (int node=target; node!=-1; node=parent[node]) {
        result.compoundIds.push_back(node);
        if (reaction[node]>=0) result.reactionIds.push_back(reaction[node]);
    }
    std::reverse(result.compoundIds.begin(),result.compoundIds.end());
    std::reverse(result.reactionIds.begin(),result.reactionIds.end());
    return result;
}

std::vector<std::pair<int,int>> snapshot(const std::deque<int>& entries,
                                         const std::vector<int>& distance) {
    std::vector<std::pair<int,int>> out;
    for (int id : entries) {
        if (out.size() >= 16) break;
        out.push_back({id, id >= 0 && id < static_cast<int>(distance.size()) ?
                        distance[id] : -1});
    }
    return out;
}

struct DSU {
    std::vector<int> parent, size;
    explicit DSU(int n):parent(n),size(n,1) { std::iota(parent.begin(),parent.end(),0); }
    int find(int x) {
        while (parent[x]!=x) { parent[x]=parent[parent[x]]; x=parent[x]; }
        return x;
    }
    void unite(int a,int b) {
        a=find(a); b=find(b);
        if (a==b) return;
        if (size[a]<size[b]) std::swap(a,b);
        parent[b]=a; size[a]+=size[b];
    }
};

template<class Clock=std::chrono::steady_clock>
double microseconds(typename Clock::time_point start) {
    return std::chrono::duration<double,std::micro>(Clock::now()-start).count();
}
}

Trace trace(const ReactionGraph& graph, const std::string& algorithm,
            const std::string& from, const std::string& to, std::size_t maxEvents) {
    Trace out;
    const auto start = graph.compoundId(from);
    const auto target = graph.compoundId(to);
    if (!start || !target) return out;
    const auto& adj = graph.adjacency();
    const int n = static_cast<int>(adj.size());
    std::vector<int> distance(n,INF), parent(n,-1), reaction(n,-1);
    const auto emit = [&](const std::string& type,int node,int u,int v,int dist,
                          const std::vector<std::pair<int,int>>& frontier) {
        if (out.events.size() >= maxEvents) { out.truncated=true; return; }
        Event e;
        e.type=type; e.node=node; e.from=u; e.to=v; e.distance=dist;
        e.frontier=frontier;
        out.events.push_back(std::move(e));
    };
    distance[*start] = 0;
    if (algorithm == "bfs" || algorithm == "dfs") {
        std::deque<int> frontier{*start};
        std::vector<bool> seen(n,false);
        seen[*start]=true;
        emit("enqueue",*start,-1,-1,0,snapshot(frontier,distance));
        while (!frontier.empty()) {
            int u;
            if (algorithm=="dfs") { u=frontier.back();frontier.pop_back(); }
            else { u=frontier.front();frontier.pop_front(); }
            out.path.visitedOrder.push_back(u);
            emit(algorithm=="dfs"?"pop_stack":"dequeue",u,-1,-1,distance[u],
                 snapshot(frontier,distance));
            if (u == *target) break;
            const auto& neighbors=adj[u];
            // Reverse iteration ensures normal DFS left-to-right exploration.
            for (std::size_t i=0;i<neighbors.size();++i) {
                const auto& e=neighbors[algorithm=="dfs"?neighbors.size()-1-i:i];
                if (seen[e.to]) continue;
                seen[e.to]=true;
                parent[e.to]=u; reaction[e.to]=e.reactionId;
                distance[e.to]=distance[u]+1;
                frontier.push_back(e.to);
                emit(algorithm=="dfs"?"push_stack":"enqueue",e.to,u,e.to,
                     distance[e.to],snapshot(frontier,distance));
            }
        }
    } else if (algorithm=="dijkstra" || algorithm=="astar") {
        // Dijkstra / A* traces use the same exact settled-distance semantics.
        // A* can follow a different order from Dijkstra in its real solver;
        // this display is explicitly marked Dijkstra if A* is requested.
        using State=std::pair<int,int>;
        std::priority_queue<State,std::vector<State>,std::greater<State>> heap;
        heap.push({0,*start});
        std::vector<bool> settled(n,false);
        emit("heap_push",*start,-1,-1,0,{{*start,0}});
        while (!heap.empty()) {
            const auto [cost,u]=heap.top();heap.pop();
            if (settled[u] || cost!=distance[u]) continue;
            settled[u]=true;
            out.path.visitedOrder.push_back(u);
            std::vector<std::pair<int,int>> heapView;
            auto copy=heap;
            while (!copy.empty() && heapView.size()<16) {
                heapView.push_back({copy.top().second,copy.top().first});
                copy.pop();
            }
            emit("settle",u,-1,-1,cost,heapView);
            if (u==*target) break;
            for (const auto& e:adj[u]) {
                if (cost>INF-e.cost || cost+e.cost>=distance[e.to]) continue;
                distance[e.to]=cost+e.cost;
                parent[e.to]=u;reaction[e.to]=e.reactionId;
                heap.push({distance[e.to],e.to});
                emit("relax",e.to,u,e.to,distance[e.to],
                     {{e.to,distance[e.to]}});
            }
        }
    } else {
        return out;
    }
    if (distance[*target] != INF) {
        out.path.found=true;
        out.path.totalCost=algorithm=="bfs"||algorithm=="dfs"?distance[*target]:distance[*target];
        for (int u=*target;u!=-1;u=parent[u]) {
            out.path.compoundIds.push_back(u);
            if (reaction[u]>=0) out.path.reactionIds.push_back(reaction[u]);
        }
        std::reverse(out.path.compoundIds.begin(),out.path.compoundIds.end());
        std::reverse(out.path.reactionIds.begin(),out.path.reactionIds.end());
    }
    emit("complete",*target,-1,-1,out.path.found?out.path.totalCost:-1,{});
    return out;
}

Trace traceTarjan(const ReactionGraph& graph,std::size_t maxEvents) {
    Trace out;
    const auto& adj=graph.adjacency();
    const int n=static_cast<int>(adj.size());
    std::vector<int> index(n,-1),low(n,-1),stack;
    std::vector<bool> onStack(n,false);
    int next=0;
    const auto emit=[&](const std::string& type,int node,int other) {
        if(out.events.size()>=maxEvents){out.truncated=true;return;}
        Event e; e.type=type;e.node=node;e.to=other;
        e.distance=index[node];e.lowLink=low[node];
        for(auto it=stack.rbegin();it!=stack.rend() && e.frontier.size()<16;++it)
            e.frontier.push_back({*it,low[*it]});
        out.events.push_back(std::move(e));
    };
    std::function<void(int)> visit=[&](int u){
        index[u]=low[u]=next++;
        stack.push_back(u);onStack[u]=true;
        emit("discover",u,-1);
        for(const auto& e:adj[u]){
            const int v=e.to;
            if(index[v]==-1){visit(v);low[u]=std::min(low[u],low[v]);emit("lowlink",u,v);}
            else if(onStack[v]){low[u]=std::min(low[u],index[v]);emit("back_edge",u,v);}
        }
        if(low[u]==index[u]){
            emit("scc_start",u,-1);
            while(true){
                int v=stack.back();stack.pop_back();onStack[v]=false;
                emit("scc_member",v,u);
                if(v==u)break;
            }
        }
    };
    for(int i=0;i<n;++i)if(index[i]==-1)visit(i);
    return out;
}

ComponentGraph components(const ReactionGraph& graph) {
    ComponentGraph result;
    result.components=graph.stronglyConnectedComponents().components;
    const auto& adj=graph.adjacency();
    const int n=static_cast<int>(adj.size());
    std::vector<int> componentId(n,-1);
    for(std::size_t i=0;i<result.components.size();++i)
        for(int u:result.components[i])componentId[u]=static_cast<int>(i);
    DSU dsu(n);
    std::set<std::pair<int,int>> unique;
    for(int u=0;u<n;++u)for(const auto& e:adj[u]){
        dsu.unite(u,e.to);
        if(componentId[u]!=componentId[e.to])
            unique.insert({componentId[u],componentId[e.to]});
    }
    result.dagEdges.assign(unique.begin(),unique.end());
    std::vector<std::vector<int>> dag(result.components.size());
    std::vector<int> indegree(result.components.size(),0);
    for(const auto& edge:result.dagEdges){dag[edge.first].push_back(edge.second);++indegree[edge.second];}
    std::queue<int> queue;
    for(std::size_t i=0;i<indegree.size();++i)if(indegree[i]==0)queue.push(static_cast<int>(i));
    while(!queue.empty()){
        const int u=queue.front();queue.pop();
        result.topological.push_back(u);
        for(int v:dag[u])if(--indegree[v]==0)queue.push(v);
    }
    std::vector<int> rootId(n,-1);
    result.weakComponent.resize(n);
    for(int i=0;i<n;++i){
        int root=dsu.find(i);
        if(rootId[root]==-1)rootId[root]=result.weakCount++;
        result.weakComponent[i]=rootId[root];
    }
    return result;
}

std::vector<PathResult> kShortest(const ReactionGraph& graph,
     const std::string& from,const std::string& to,std::size_t k) {
    std::vector<PathResult> accepted;
    if(k==0 || k>10)return accepted;
    auto start=graph.compoundId(from),target=graph.compoundId(to);
    if(!start||!target)return accepted;
    PathResult first=filteredPath(graph,*start,*target,{},{});
    if(!first.found)return accepted;
    accepted.push_back(std::move(first));
    std::vector<PathResult> candidates;
    auto signature=[](const PathResult& p){
        return std::make_pair(p.compoundIds,p.reactionIds);
    };
    const auto& adj=graph.adjacency();
    for(std::size_t rank=1;rank<k;++rank){
        const auto& previous=accepted.back();
        for(std::size_t spurIndex=0;spurIndex+1<previous.compoundIds.size();++spurIndex){
            std::vector<int> root(previous.compoundIds.begin(),
                                  previous.compoundIds.begin()+spurIndex+1);
            std::vector<int> rootReactions(previous.reactionIds.begin(),
                                          previous.reactionIds.begin()+spurIndex);
            int rootCost=0;
            for(std::size_t i=0;i<rootReactions.size();++i)
                for(const auto& e:adj[root[i]])
                    if(e.to==root[i+1]&&e.reactionId==rootReactions[i]){
                        rootCost+=e.cost;break;
                    }
            std::set<int> removedNodes(root.begin(),root.end()-1);
            std::set<BlockedEdge> removedEdges;
            for(const auto& p:accepted){
                if(p.compoundIds.size()>spurIndex+1 &&
                   std::equal(root.begin(),root.end(),p.compoundIds.begin()) &&
                   std::equal(rootReactions.begin(),rootReactions.end(),p.reactionIds.begin()))
                    removedEdges.insert({p.compoundIds[spurIndex],
                                         p.compoundIds[spurIndex+1],p.reactionIds[spurIndex]});
            }
            auto spur=filteredPath(graph,root.back(),*target,removedNodes,removedEdges);
            if(!spur.found)continue;
            PathResult p;
            p.found=true;p.totalCost=rootCost+spur.totalCost;
            p.compoundIds=std::move(root);
            p.compoundIds.insert(p.compoundIds.end(),spur.compoundIds.begin()+1,spur.compoundIds.end());
            p.reactionIds=std::move(rootReactions);
            p.reactionIds.insert(p.reactionIds.end(),spur.reactionIds.begin(),spur.reactionIds.end());
            const auto sig=signature(p);
            auto has=[&](const PathResult& x){return signature(x)==sig;};
            if(std::any_of(accepted.begin(),accepted.end(),has) ||
               std::any_of(candidates.begin(),candidates.end(),has))continue;
            candidates.push_back(std::move(p));
        }
        if(candidates.empty())break;
        std::sort(candidates.begin(),candidates.end(),[](const auto& a,const auto& b){
            if(a.totalCost!=b.totalCost)return a.totalCost<b.totalCost;
            if(a.compoundIds!=b.compoundIds)return a.compoundIds<b.compoundIds;
            return a.reactionIds<b.reactionIds;
        });
        accepted.push_back(std::move(candidates.front()));
        candidates.erase(candidates.begin());
    }
    return accepted;
}

PathResult withoutEdge(const ReactionGraph& graph,const std::string& from,
                       const std::string& to,int source,int target,int reactionId) {
    auto a=graph.compoundId(from),b=graph.compoundId(to);
    if(!a||!b)return {};
    return filteredPath(graph,*a,*b,{},{{source,target,reactionId}});
}

PathResult withEdge(const ReactionGraph& graph,const std::string& from,
                    const std::string& to,int source,int target,
                    int reactionId,int weight,bool replaceExisting) {
    const auto start=graph.compoundId(from),end=graph.compoundId(to);
    if(!start||!end || source<0 || target<0 ||
       source>=static_cast<int>(graph.compounds().size()) ||
       target>=static_cast<int>(graph.compounds().size()) ||
       weight<=0 || weight>1000)return {};
    std::set<BlockedEdge> removed;
    if(replaceExisting)removed.insert({source,target,reactionId});
    // Reaction id -2 marks a hypothetical nonchemical edge in the returned path.
    return filteredPath(graph,*start,*end,{},removed,
                        std::make_tuple(source,target,-2,weight));
}

RepresentationStats compareRepresentations(const ReactionGraph& graph,int iterations) {
    RepresentationStats out;
    const auto& adj=graph.adjacency();
    out.nodes=adj.size();out.edges=graph.edgeCount();
    std::vector<std::size_t> offsets(adj.size()+1,0);
    for(std::size_t i=0;i<adj.size();++i){
        offsets[i+1]=offsets[i]+adj[i].size();
        out.adjacencyBytes+=adj[i].capacity()*sizeof(Edge);
    }
    out.adjacencyBytes+=adj.capacity()*sizeof(std::vector<Edge>);
    std::vector<Edge> flat;
    flat.reserve(out.edges);
    for(const auto& row:adj)flat.insert(flat.end(),row.begin(),row.end());
    out.csrBytes=offsets.capacity()*sizeof(std::size_t)+flat.capacity()*sizeof(Edge);
    volatile std::size_t checksum=0;
    auto run=[&](bool csr){
        std::vector<int> dist(adj.size(),-1);
        std::queue<int> q;
        const int src=0;
        dist[src]=0;q.push(src);
        while(!q.empty()){
            int u=q.front();q.pop();
            if(csr){
                for(std::size_t i=offsets[u];i<offsets[u+1];++i){
                    int v=flat[i].to;
                    if(dist[v]<0){dist[v]=dist[u]+1;q.push(v);}
                }
            }else{
                for(const auto& e:adj[u])if(dist[e.to]<0){
                    dist[e.to]=dist[u]+1;q.push(e.to);
                }
            }
        }
        std::size_t reached=0;
        for(int d:dist)if(d>=0)++reached;
        checksum+=reached;
        return reached;
    };
    iterations=std::max(1,std::min(iterations,10000));
    const auto beforeAdj=std::chrono::steady_clock::now();
    for(int i=0;i<iterations;++i)out.reached=run(false);
    out.adjacencyUs=microseconds(beforeAdj)/iterations;
    const auto beforeCsr=std::chrono::steady_clock::now();
    for(int i=0;i<iterations;++i)run(true);
    out.csrUs=microseconds(beforeCsr)/iterations;
    (void)checksum;
    return out;
}

SyntheticStats synthetic(int nodes,int edges,int seed){
    SyntheticStats out;
    nodes=std::max(2,std::min(nodes,25000));
    edges=std::max(nodes-1,std::min(edges,250000));
    out.nodes=nodes;out.edges=edges;out.seed=seed;
    std::mt19937 rng(static_cast<std::mt19937::result_type>(seed));
    std::uniform_int_distribution<int> vertex(0,nodes-1),weight(1,9);
    std::vector<std::vector<std::pair<int,int>>> adj(nodes);
    for(int i=0;i<nodes-1;++i)adj[i].push_back({i+1,weight(rng)});
    for(int i=nodes-1;i<edges;++i)adj[vertex(rng)].push_back({vertex(rng),weight(rng)});
    {
        std::vector<int> dist(nodes,-1);
        std::queue<int> q;q.push(0);dist[0]=0;
        auto start=std::chrono::steady_clock::now();
        while(!q.empty()){
            int u=q.front();q.pop();
            for(auto [v,w]:adj[u]){(void)w;if(dist[v]!=-1)continue;dist[v]=dist[u]+1;q.push(v);}
        }
        out.bfsUs=microseconds(start);out.shortestHops=dist.back();
        for(int d:dist)if(d!=-1)++out.reachable;
    }
    {
        std::vector<int> dist(nodes,INF);dist[0]=0;
        using State=std::pair<int,int>;
        std::priority_queue<State,std::vector<State>,std::greater<State>> pq;
        pq.push({0,0});
        auto start=std::chrono::steady_clock::now();
        while(!pq.empty()){
            auto [d,u]=pq.top();pq.pop();
            if(d!=dist[u])continue;
            for(auto [v,w]:adj[u])if(d+w<dist[v]){dist[v]=d+w;pq.push({dist[v],v});}
        }
        out.dijkstraUs=microseconds(start);
        out.weightedCost=dist.back()==INF?-1:dist.back();
    }
    return out;
}
} // namespace chempath::lab
