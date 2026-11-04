/**
 * Bounded, in-memory stable layout cache. Navigation between Explore and
 * Laboratory should never rerun ForceAtlas2 or shuffle the graph.
 * Each cache entry is keyed by its exact ordered compound/reaction sequence.
 *
 * No graph algorithms or reaction data are altered. Max five bounded layouts.
 */
const MAX_LAYOUTS=5;
const cache=new Map();
function mix(h,value){
  for(const ch of String(value)){
    h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
  }
  return Math.imul(h^31,16777619)>>>0;
}
export function layoutKey(network){
  if(!network?.nodes||!network?.edges)return null;
  let h1=2166136261,h2=0x9e3779b9;
  for(const node of network.nodes){
    h1=mix(h1,node.id);h1=mix(h1,node.category||"");
    h2=mix(h2,node.formula||"");h2=mix(h2,node.name||"");
  }
  for(const edge of network.edges){
    h1=mix(h1,edge.id??"");h1=mix(h1,edge.source);h1=mix(h1,edge.target);
    h2=mix(h2,edge.reactionId??"");h2=mix(h2,edge.cost??"");
  }
  return network.nodes.length+":"+network.edges.length+":"+
    h1.toString(36)+":"+h2.toString(36);
}
export function restoreLayout(key,graph){
  if(!key||!cache.has(key))return false;
  const layout=cache.get(key);
  if(layout.size!==graph.order)return false;
  for(const node of graph.nodes())if(!layout.has(node))return false;
  for(const node of graph.nodes()){
    const point=layout.get(node);
    graph.setNodeAttribute(node,"x",point.x);
    graph.setNodeAttribute(node,"y",point.y);
  }
  // LRU: recently reopened dataset stays hot.
  cache.delete(key);cache.set(key,layout);
  return true;
}
export function rememberLayout(key,graph){
  if(!key)return;
  const layout=new Map();
  for(const node of graph.nodes()){
    const a=graph.getNodeAttributes(node);
    if(!Number.isFinite(a.x)||!Number.isFinite(a.y))return;
    layout.set(node,{x:a.x,y:a.y});
  }
  cache.delete(key);cache.set(key,layout);
  while(cache.size>MAX_LAYOUTS)cache.delete(cache.keys().next().value);
}
export function clearLayoutCache(){cache.clear();}
