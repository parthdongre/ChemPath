import assert from "node:assert/strict";
import test from "node:test";
import {createGlassDisplacement,REFRACTION_SCALE} from "../web/src/components/liquidOptics.js";
import {buildOverviewClusters} from "../web/src/components/graphClusters.js";
import {layoutKey,rememberLayout,restoreLayout,clearLayoutCache} from "../web/src/components/graphLayoutCache.js";

test("a glass SDF keeps its center optically neutral",()=>{
  const m=createGlassDisplacement(180,60,{radius:15});
  assert.equal(m.data.length,180*60*4);
  const center=(30*180+90)*4;
  assert.ok(Math.abs(m.data[center]-128)<=1);
  assert.ok(Math.abs(m.data[center+1]-128)<=1);
  assert.equal(m.data[center+2],0);
  assert.equal(m.data[center+3],255);
});
test("real refraction only bends pixels near the curved rim",()=>{
  const map=createGlassDisplacement(160,58,{radius:15,bezel:16,depth:13});
  let refracted=0,flat=0;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=(y*map.width+x)*4;
    if(Math.abs(map.data[i]-128)>2||Math.abs(map.data[i+1]-128)>2)refracted++;
    else flat++;
    assert.equal(map.data[i+3],255);
  }
  assert.ok(refracted>400,"Rim should contain a meaningful optical bend");
  assert.ok(flat>1000,"Most center/background pixels should remain stable");
  assert.equal(REFRACTION_SCALE,30);
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
