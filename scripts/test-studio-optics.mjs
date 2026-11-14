import assert from "node:assert/strict";
import test from "node:test";
import {buildOverviewClusters,spreadClusterMarkers} from "../web/src/components/graphClusters.js";
import {layoutKey,rememberLayout,restoreLayout,clearLayoutCache} from "../web/src/components/graphLayoutCache.js";
import {formulaText,looksLikeSmiles,isStructureRecord,compoundLabel} from "../web/src/theme.js";

test("formulas render with subscripts and charges",()=>{
  assert.equal(formulaText("CH4"),"CH₄");
  assert.equal(formulaText("HCO3-"),"HCO₃⁻");
  assert.equal(formulaText("SO4^2-"),"SO₄²⁻");
  assert.equal(formulaText("Fe^3+"),"Fe³⁺");
  assert.equal(formulaText("Al(OH)3"),"Al(OH)₃");
  assert.equal(formulaText("NH4+"),"NH₄⁺");
  assert.equal(formulaText("C7H11NO9P-2"),"C₇H₁₁NO₉P²⁻");
  assert.equal(formulaText("2H2O"),"2H₂O","leading coefficients stay full size");
});
test("SMILES identifiers are never reformatted",()=>{
  assert.ok(looksLikeSmiles("CC(=O)O"));
  assert.ok(!looksLikeSmiles("Cl-"));
  assert.equal(formulaText("C1=CC=CC=C1"),"C1=CC=CC=C1");
  const ord={name:"SMILES:C1CCCCC1",formula:"C1CCCCC1",category:"ORD molecule"};
  assert.ok(isStructureRecord(ord));
  assert.equal(compoundLabel(ord),"C1CCCCC1");
});
test("spatial clusters are repeatable and leave hubs unaggregated",()=>{
  const nodes=Array.from({length:90},(_,i)=>String(i));
  const attrs=new Map(nodes.map((id,i)=>[id,{
    x:.14+Math.floor(i/18)*.15+(i%3)*.007,
    y:.21+(i%18)*.018,
    category:i%4?"organic":"inorganic"
  }]));
  const graph={hasNode:id=>attrs.has(id),getNodeAttributes:id=>attrs.get(id)};
  const priority=new Map(nodes.map((id,i)=>[id,i]));
  const a=buildOverviewClusters(graph,{priority},new Set(nodes));
  const b=buildOverviewClusters(graph,{priority},new Set(nodes));
  assert.deepEqual(a.clusters.map(g=>g.id),b.clusters.map(g=>g.id));
  assert.ok(a.clusters.length>0,"Dense network should yield visible groups");
  for(let i=0;i<24;i++)assert.ok(!a.hiddenNodeIds.has(String(i)));
  for(const cluster of a.clusters)assert.equal(cluster.members.length,cluster.count);
  assert.ok(a.hiddenNodeIds.size<nodes.length);
});
test("layout caching restores coordinates and never mutates network records",()=>{
  clearLayoutCache();
  const network={
    nodes:[{id:1,category:"organic",name:"A"},{id:2,category:"ion",name:"B"}],
    edges:[{id:"a",source:1,target:2,reactionId:2,cost:1}]
  };
  const key=layoutKey(network);
  const attrs=new Map([["1",{x:.12,y:.24}],["2",{x:.83,y:.75}]]);
  const graph={
    order:2,nodes:()=>["1","2"],
    getNodeAttributes:id=>attrs.get(id),
    setNodeAttribute:(id,k,v)=>{attrs.get(id)[k]=v;}
  };
  rememberLayout(key,graph);
  attrs.get("1").x=.9;attrs.get("2").y=.1;
  assert.equal(restoreLayout(key,graph),true);
  assert.equal(attrs.get("1").x,.12);
  assert.equal(attrs.get("2").y,.75);
  assert.equal(restoreLayout("unrelated",graph),false);
  assert.equal(network.nodes[0].name,"A");
  clearLayoutCache();
});

test("cluster circles repel without overlapping at normal viewport size",()=>{
  const points=[
    {id:"a",x:100,y:100},{id:"b",x:115,y:105},
    {id:"c",x:112,y:120},{id:"d",x:215,y:190}
  ];
  const spread=spreadClusterMarkers(points,500,400);
  for(let i=0;i<spread.length;i++)for(let j=i+1;j<spread.length;j++){
    const d=Math.hypot(spread[i].x-spread[j].x,spread[i].y-spread[j].y);
    assert.ok(d>51,"Marker pair "+i+","+j+" should not overlap");
  }
  for(const p of spread){
    assert.ok(p.x>=37&&p.x<=463);
    assert.ok(p.y>=37&&p.y<=363);
  }
  assert.deepEqual(points[0],{id:"a",x:100,y:100},
    "screen layout must not mutate input positions");
});
