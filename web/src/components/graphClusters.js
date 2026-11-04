/**
 * Map-style screen decluttering for the curated working graph.
 * Clusters are PURELY PRESENTATIONAL and never remove graph vertices or
 * edges from Graphology or the C++ backend.
 */
export function buildOverviewClusters(graph,index,visibleNodes,{
  columns=8,rows=6,minimum=3,preserveRanks=24
}={}){
  const cells=new Map(),hiddenNodeIds=new Set();
  if(!graph||!index||!visibleNodes)return {clusters:[],hiddenNodeIds};
  for(const id of visibleNodes){
    const key=String(id),rank=index.priority.get(key)??Infinity;
    if(rank<preserveRanks||!graph.hasNode(key))continue;
    const a=graph.getNodeAttributes(key);
    if(!Number.isFinite(a.x)||!Number.isFinite(a.y))continue;
    const col=Math.max(0,Math.min(columns-1,Math.floor(a.x*columns)));
    const row=Math.max(0,Math.min(rows-1,Math.floor(a.y*rows)));
    const cellId=col+"-"+row;
    if(!cells.has(cellId))cells.set(cellId,{id:cellId,col,row,members:[],x:0,y:0,categories:new Map()});
    const group=cells.get(cellId);
    group.members.push(key);
    group.x+=a.x;group.y+=a.y;
    const category=a.category||"Other";
    group.categories.set(category,(group.categories.get(category)||0)+1);
  }
  const clusters=[];
  for(const item of cells.values()){
    if(item.members.length<minimum)continue;
    const category=[...item.categories].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||"Compounds";
    item.members.sort((a,b)=>a.localeCompare(b));
    for(const id of item.members)hiddenNodeIds.add(id);
    clusters.push({
      id:item.id,x:item.x/item.members.length,y:item.y/item.members.length,
      count:item.members.length,category,members:item.members
    });
  }
  clusters.sort((a,b)=>a.id.localeCompare(b.id));
  return {clusters,hiddenNodeIds};
}
