import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCartographicIndex,mapStageForRatio,cartographicVisibility
} from "../web/src/components/graphCartography.js";

function fixture(){
  const edges=[
    ["1","a","b"],["2","b","c"],["3","c","d"],
    ["4","a","c"],["5","a","d"],["6","a","e"],
    ["7","a","f"],["8","d","e"],["9","e","f"],["10","b","f"]
  ];
  const nodes=["a","b","c","d","e","f"];
  const degree=new Map(nodes.map(x=>[x,0]));
  for(const [,a,b] of edges){degree.set(a,degree.get(a)+1);degree.set(b,degree.get(b)+1);}
  return {
    nodes:()=>nodes,
    edges:()=>edges.map(e=>e[0]),
    source:id=>edges.find(e=>e[0]===id)[1],
    target:id=>edges.find(e=>e[0]===id)[2],
    degree:id=>degree.get(id)
  };
}
test("camera zoom selects deterministic cartographic levels",()=>{
  assert.equal(mapStageForRatio(1),"overview");
  assert.equal(mapStageForRatio(.57),"overview");
  assert.equal(mapStageForRatio(.56),"neighborhood");
  assert.equal(mapStageForRatio(.26),"neighborhood");
  assert.equal(mapStageForRatio(.25),"detail");
  assert.equal(mapStageForRatio(Infinity),"overview");
});
test("index is stable, never changes the input graph",()=>{
  const g=fixture();
  const original=g.edges().slice();
  const a=buildCartographicIndex(g),b=buildCartographicIndex(g);
  assert.deepEqual(a.entries.map(x=>x.id),b.entries.map(x=>x.id));
  assert.equal(g.edges().length,original.length);
  assert.equal(a.counts.totalNodes,6);
  assert.equal(a.counts.totalEdges,10);
  assert.ok(a.overview.size<=10);
  assert.ok(a.neighborhood.size>=a.overview.size);
});
test("zoom and all-links mode reveal the full visual graph",()=>{
  const graph=fixture();
  const index=buildCartographicIndex(graph);
  const all=cartographicVisibility(index,{stage:"overview",showAll:true});
  assert.equal(all.visibleNodes.size,6);
  assert.equal(all.visibleEdges.size,10);
  const zoom=cartographicVisibility(index,{stage:"detail"});
  assert.equal(zoom.visibleEdges.size,10);
  assert.equal(zoom.visibleNodes.size,6);
});
test("highlighted route survives all overview / focus filters",()=>{
  const index=buildCartographicIndex(fixture());
  const view=cartographicVisibility(index,{
    stage:"overview",routeNodes:["a","b","c","d"],routeEdges:["1","2","3"],selected:"d"
  });
  for(const node of ["a","b","c","d"])assert.ok(view.visibleNodes.has(node),node);
  for(const edge of ["1","2","3"])assert.ok(view.visibleEdges.has(edge),edge);
  assert.equal(view.mode,"Route focus");
  assert.equal(view.hasRoute,true);
});
test("an inspected orphan remains visible in overview",()=>{
  const graph={
    nodes:()=>["a","b","orphan"],
    edges:()=>["one"],
    degree:id=>id==="orphan"?0:1,
    source:()=> "a",target:()=> "b"
  };
  const index=buildCartographicIndex(graph);
  const view=cartographicVisibility(index,{selected:"orphan"});
  assert.ok(view.visibleNodes.has("orphan"));
  assert.ok(!view.routeNodeIds.size);
});
