/**
 * Cartographic level-of-detail for ChemPath's *visualization only*.
 *
 * Apple Maps-inspired semantics:
 *   overview -> arterial connections and high-salience places
 *   neighborhood -> collector connections and more places
 *   detail -> all participation edges and compounds
 *
 * No graph edges are removed from Graphology or from the C++ engine.
 * Every hidden edge can be recovered by zooming or toggling "All links".
 * Deterministic ranking avoids flickering after each camera movement.
 */
export const MAP_STAGES = Object.freeze(["overview", "neighborhood", "detail"]);

export function mapStageForRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio >= 0.57) return "overview";
  if (ratio >= 0.26) return "neighborhood";
  return "detail";
}

export function buildCartographicIndex(graph) {
  const nodeIds = graph.nodes().map(String);
  const degrees = new Map(nodeIds.map(id => [id, graph.degree(id)]));
  const nodeOrder = nodeIds.sort((left,right)=>
    (degrees.get(right)-degrees.get(left)) || left.localeCompare(right)
  );
  const priority = new Map(nodeOrder.map((id,index)=>[id,index]));
  const entries = graph.edges().map(id=>{
    const source=String(graph.source(id));
    const target=String(graph.target(id));
    const a=degrees.get(source)??0,b=degrees.get(target)??0;
    // Prioritize meaningful connections between hubs, not every hub-to-leaf spoke.
    const score=Math.sqrt((a+1)*(b+1)) + 0.15*Math.min(a,b);
    return {id:String(id),source,target,score};
  }).sort((a,b)=>(b.score-a.score)||a.id.localeCompare(b.id));

  const overviewLimit=Math.min(entries.length,Math.max(25,Math.min(150,Math.ceil(entries.length*0.055))));
  const neighborhoodLimit=Math.min(entries.length,Math.max(90,Math.min(620,Math.ceil(entries.length*0.20))));
  const overview=new Set();
  const neighborhood=new Set();
  const overviewCounts=new Map();
  const select=(limit,target,cap)=>{
    for(const edge of entries){
      if(target.size>=limit)break;
      if((overviewCounts.get(edge.source)??0)>=cap || (overviewCounts.get(edge.target)??0)>=cap)continue;
      target.add(edge.id);
      overviewCounts.set(edge.source,(overviewCounts.get(edge.source)??0)+1);
      overviewCounts.set(edge.target,(overviewCounts.get(edge.target)??0)+1);
    }
  };
  select(overviewLimit,overview,18);
  // Preserve the major edges across the medium-detail level.
  for(const id of overview)neighborhood.add(id);
  overviewCounts.clear();
  select(neighborhoodLimit,neighborhood,65);

  const tierByEdge=new Map();
  for(const edge of entries){
    tierByEdge.set(edge.id,overview.has(edge.id)?"arterial":
      neighborhood.has(edge.id)?"collector":"local");
  }
  return {
    degrees,priority,entries,tierByEdge,
    overview,neighborhood,
    counts:{
      totalNodes:nodeIds.length,totalEdges:entries.length,
      overviewNodes:Math.min(nodeIds.length,Math.max(45,Math.min(240,Math.ceil(nodeIds.length*.40)))),
      neighborhoodNodes:Math.min(nodeIds.length,Math.max(180,Math.ceil(nodeIds.length*.83))),
      overviewEdges:overview.size,neighborhoodEdges:neighborhood.size
    }
  };
}

export function cartographicVisibility(index, {
  stage="overview",showAll=false,routeNodes=[],routeEdges=[],selected=null
}={}) {
  const routeNodeIds=new Set(routeNodes.map(String));
  const routeEdgeIds=new Set(routeEdges.map(String));
  const hasRoute=routeNodeIds.size>1;
  const contextualEdges=new Set();
  const contextualNodes=new Set(routeNodeIds);
  if(selected!=null)contextualNodes.add(String(selected));
  if(hasRoute&&!showAll){
    for(const entry of index.entries){
      if(contextualEdges.size>=56)break;
      if(routeNodeIds.has(entry.source)||routeNodeIds.has(entry.target)){
        contextualEdges.add(entry.id);
        contextualNodes.add(entry.source);
        contextualNodes.add(entry.target);
      }
    }
  }
  const visibleEdges=new Set();
  const visibleNodes=new Set();
  const rankLimit=stage==="overview"?index.counts.overviewNodes:
    stage==="neighborhood"?index.counts.neighborhoodNodes:index.counts.totalNodes;
  if(showAll||stage==="detail"){
    for(const id of index.priority.keys())visibleNodes.add(id);
    for(const entry of index.entries)visibleEdges.add(entry.id);
  }else if(hasRoute){
    for(const id of contextualNodes)visibleNodes.add(id);
    for(const entry of index.entries){
      if(routeEdgeIds.has(entry.id)||contextualEdges.has(entry.id))
        visibleEdges.add(entry.id);
    }
    // Maintain a tiny amount of geographical context without the hairball.
    for(const entry of index.entries){
      if(visibleEdges.size>=86)break;
      if(index.overview.has(entry.id)){
        visibleEdges.add(entry.id);visibleNodes.add(entry.source);visibleNodes.add(entry.target);
      }
    }
  }else{
    let count=0;
    for(const id of index.priority.keys()){
      if(count++>=rankLimit)break;
      visibleNodes.add(id);
    }
    for(const entry of index.entries){
      if((stage==="overview"?index.overview:index.neighborhood).has(entry.id)){
        visibleEdges.add(entry.id);
        visibleNodes.add(entry.source);
        visibleNodes.add(entry.target);
      }
    }
  }
  // The selected node, route and edge endpoints cannot disappear due to LOD.
  for(const id of contextualNodes)visibleNodes.add(id);
  for(const entry of index.entries){
    if(routeEdgeIds.has(entry.id)){
      visibleEdges.add(entry.id);
      visibleNodes.add(entry.source);visibleNodes.add(entry.target);
    }
  }
  return {visibleNodes,visibleEdges,routeNodeIds,routeEdgeIds,hasRoute,
    mode:showAll?"All links":hasRoute&&stage!=="detail"?"Route focus":
      stage==="overview"?"Network overview":stage==="neighborhood"?"Neighborhood":"Full detail"};
}
