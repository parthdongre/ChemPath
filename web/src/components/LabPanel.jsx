import {useEffect,useMemo,useState} from "react";
import {Play,Pause,StepForward,StepBack,RotateCcw,Network,Route,BarChart3,Gauge,Info} from "lucide-react";
import {api} from "../api";
import NetworkGraph from "./NetworkGraph.jsx";
import "./Lab.css";

const tabs=[["trace","Execution"],["compare","Comparison"],["paths","Routes"],
  ["components","Components"],["bench","Benchmarks"],["trie","Trie"],["sandbox","Playground"]];
const number=(x)=>typeof x==="number"?x.toLocaleString(undefined,{maximumFractionDigits:3}):"—";
function Metric({title,value,unit=""}){
  return <div className="lab-metric"><span>{title}</span><strong>{number(value)}</strong><small>{unit}</small></div>;
}
function RouteView({route}){
  if(!route)return <p className="lab-muted">Run the query to see its result.</p>;
  if(!route.found)return <p className="lab-muted">No directed route found.</p>;
  return <div><p className="lab-muted">{route.steps} steps · weight {route.totalCost}</p>
    <div className="lab-route">
    {(route.path||[]).map((n,i)=><div key={n.id+"-"+i} className="lab-route-node">
      <b>{n.formula||n.name}</b><span>{n.name}</span>
      {i<route.path.length-1?<em>→</em>:null}</div>)}</div>
    <div className="lab-reactions">{(route.reactionPath||[]).map((r,i)=>
      <details key={r.reactionId+"-"+i}><summary>{i+1}. {r.reaction}</summary>
      <p>{r.equation}</p><small>{r.conditions} · weight {r.cost}</small></details>)}</div>
    </div>;
}
export default function LabPanel({network,from,to}){
  const [tab,setTab]=useState("trace"),[algorithm,setAlgorithm]=useState("dijkstra");
  const [trace,setTrace]=useState(null),[step,setStep]=useState(0),[playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(1),[comparison,setComparison]=useState(null);
  const [paths,setPaths]=useState(null),[components,setComponents]=useState(null);
  const [csr,setCsr]=useState(null),[synthetic,setSynthetic]=useState(null);
  const [nodeCount,setNodeCount]=useState(1000),[edgeCount,setEdgeCount]=useState(4000);
  const [seed,setSeed]=useState(42),[blocked,setBlocked]=useState(""),[sandbox,setSandbox]=useState(null);
  const [editMode,setEditMode]=useState("remove"),[editWeight,setEditWeight]=useState(2);
  const [editTarget,setEditTarget]=useState(""),[trieQuery,setTrieQuery]=useState("meth"),[trieMatches,setTrieMatches]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const byId=useMemo(()=>new Map((network?.nodes||[]).map(n=>[n.id,n])),[network]);
  const sourceId=network?.nodes?.find(n=>n.name===from)?.id;
  const outgoing=useMemo(()=>(network?.edges||[]).filter(e=>e.source===sourceId).slice(0,100),[network,sourceId]);
  useEffect(()=>{
    setTrace(null);setPaths(null);setComparison(null);setSandbox(null);setStep(0);setPlaying(false);
  },[from,to]);
  useEffect(()=>{
    if(!playing||!trace?.events?.length)return;
    const timer=window.setInterval(()=>setStep(s=>Math.min(s+1,trace.events.length-1)),Math.max(75,650/speed));
    return ()=>window.clearInterval(timer);
  },[playing,trace,speed]);
  useEffect(()=>{if(trace&&step>=trace.events.length-1)setPlaying(false);},[step,trace]);
  const execute=async(fn)=>{
    setBusy(true);setError("");setPlaying(false);
    try{await fn();}catch(e){setError(e.message||"Request failed");}
    finally{setBusy(false);}
  };
  const current=trace?.events?.[step];
  const seen=useMemo(()=>new Set((trace?.events||[]).slice(0,step+1)
    .filter(e=>e.node>=0).map(e=>e.node)),[trace,step]);
  const ranked=useMemo(()=>(components?.components||[])
    .map((ids,i)=>({ids,i})).sort((a,b)=>b.ids.length-a.ids.length).slice(0,12),[components]);
  const focusedNetwork=useMemo(()=>{
    if(!network || !trace?.events?.length)return null;
    const preferred=new Set();
    if(sourceId!==undefined)preferred.add(sourceId);
    const targetId=network.nodes.find(n=>n.name===to)?.id;
    if(targetId!==undefined)preferred.add(targetId);
    (trace.route?.path||[]).forEach(n=>preferred.add(n.id));
    // Snapshot up to 140 vertices. The complete trace is still available
    // in the timeline, without forcing Cytoscape to relayout thousands.
    for(const event of trace.events){
      if(preferred.size>=140)break;
      if(event.node>=0)preferred.add(event.node);
    }
    const nodes=network.nodes.filter(n=>preferred.has(n.id));
    const edges=network.edges.filter(e=>preferred.has(e.source)&&preferred.has(e.target));
    return {nodes,edges};
  },[network,trace,sourceId,to]);
  const dagNetwork=useMemo(()=>{
    if(!components)return null;
    const selected=new Set();
    components.components.forEach((c,i)=>{if(c.length>1 && selected.size<75)selected.add(i);});
    for(const [u,v] of components.dagEdges){
      if(selected.size>=110)break;
      if(selected.has(u)||selected.has(v)){selected.add(u);selected.add(v);}
    }
    for(let i=0;i<components.components.length && selected.size<65;i++)selected.add(i);
    return {
      nodes:[...selected].map(i=>({id:i,name:"SCC "+i,
        formula:components.components[i].length+" nodes",category:"SCC"})),
      edges:components.dagEdges.filter(([u,v])=>selected.has(u)&&selected.has(v))
        .map(([u,v])=>({id:"dag-"+u+"-"+v,source:u,target:v,
          reaction:"SCC condensation edge",cost:1}))
    };
  },[components]);
  const maxVisited=Math.max(1,...(comparison?.algorithms||[]).map(x=>x.visited));
  return <section className="lab-panel" id="algorithm-lab">
    <header className="lab-header"><div><small>ALGORITHM LAB / C++17 ENGINE</small>
      <h2>Explore the data structures.</h2>
      <p>Interactive algorithm state, graph connectivity and real performance measurements.</p></div>
      <span className="lab-pill"><Network size={15}/>{network?.nodes?.length??"—"} compounds</span>
    </header>
    <nav className="lab-tabs" aria-label="Lab views">{tabs.map(([id,label])=>
      <button type="button" key={id} onClick={()=>{setTab(id);setPlaying(false);setError("");}}
        className={tab===id?"selected":""}>{label}</button>)}</nav>
    {error&&<div role="alert" className="lab-error">{error}</div>}
    {tab==="trace"&&<div className="lab-section">
      <div className="lab-toolbar">
        <label>Trace algorithm <select value={algorithm} onChange={e=>{setAlgorithm(e.target.value);setTrace(null);}}>
          <option value="bfs">BFS · Queue</option><option value="dfs">DFS · Stack</option>
          <option value="dijkstra">Dijkstra · Min-heap</option><option value="tarjan">Tarjan · Low-link stack</option>
        </select></label>
        <button className="lab-primary" disabled={busy} onClick={()=>execute(async()=>{
          const result=await api.labTrace(algorithm,from,to);setTrace(result);setStep(0);
        })}>Generate C++ trace</button>
        <small>{trace?.events?.length??0} events {trace?.truncated?"(capped)":""}</small>
      </div>
      {trace?.events?.length?<><div className="lab-trace-layout">
        <div className="lab-visited"><h3>Live focused graph and traversal</h3>
          {focusedNetwork&&<div className="lab-focus-graph"><NetworkGraph network={focusedNetwork}
            visitedNodeIds={[...seen]} activeNodeId={current?.node}
            selectedNodeId={sourceId} simulationRunning={true}/></div>}
          <h3>Processed nodes</h3>
          <div className="lab-visited-grid">{[...seen].slice(-75).map(id=>
            <span key={id} className={current?.node===id?"active":""}>
              {byId.get(id)?.formula||byId.get(id)?.name||id}</span>)}</div>
          <p>{seen.size} vertices processed/discovered</p>
          {trace.route?.found&&<p className="lab-found">Final path: {trace.route.path.map(n=>n.formula||n.name).join(" → ")}</p>}
        </div>
        <div className="lab-frontier"><h3>{algorithm==="dijkstra"?"Priority queue":algorithm==="bfs"?"Queue":"Stack"}</h3>
          <p><b>{current?.type?.replaceAll("_"," ")}</b> · active {byId.get(current?.node)?.name||current?.node}</p>
          <p>Distance/index: {current?.distance??"—"} {current?.lowLink>=0?"· Low-link: "+current.lowLink:""}</p>
          {(current?.frontier||[]).length?current.frontier.map(([id,value],i)=>
            <div key={i}><strong>{byId.get(id)?.formula||id}</strong><span>{value}</span></div>)
            :<small>Empty frontier</small>}
          <small>Preview of up to 16 frontier entries</small>
        </div>
      </div>
      <div className="lab-player">
        <button aria-label="Restart" onClick={()=>{setStep(0);setPlaying(false);}}><RotateCcw size={17}/></button>
        <button aria-label="Step back" onClick={()=>{setPlaying(false);setStep(s=>Math.max(0,s-1));}}><StepBack size={17}/></button>
        <button aria-label={playing?"Pause":"Play"} onClick={()=>{if(step===trace.events.length-1)setStep(0);setPlaying(x=>!x);}}>
          {playing?<Pause size={17}/>:<Play size={17}/>}</button>
        <button aria-label="Step forward" onClick={()=>{setPlaying(false);setStep(s=>Math.min(trace.events.length-1,s+1));}}><StepForward size={17}/></button>
        <input aria-label="Seek algorithm step" type="range" min="0" max={trace.events.length-1}
          value={step} onChange={e=>{setPlaying(false);setStep(Number(e.target.value));}}/>
        <span>{step+1}/{trace.events.length}</span>
        <select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>
          <option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
        </select>
      </div></>:<div className="lab-placeholder"><Info size={20}/> Select and run an algorithm to inspect its operations.</div>}
    </div>}
    {tab==="compare"&&<div className="lab-section">
      <div className="lab-toolbar"><button className="lab-primary" disabled={busy} onClick={()=>execute(async()=>{
        setComparison(await api.labCompare(from,to));})}>Compare all 8 algorithms</button>
        <small>Same graph and source/target · separate real C++ runs</small></div>
      {comparison&&<div className="lab-compare">
        <div className="lab-compare-row heading"><b>Algorithm</b><b>Visited</b><b>Runtime µs</b><b>Cost</b></div>
        {comparison.algorithms.map(a=><div key={a.name} className="lab-compare-row">
          <strong>{a.name}</strong><div className="lab-bar-wrap"><i style={{width:(a.visited/maxVisited*100)+"%"}}/>
            <small>{a.visited}</small></div><span>{number(a.microseconds)}</span>
          <span>{a.found?a.cost:"No path"}</span></div>)}
        <p className="lab-muted">BFS cost is hop count. Weighted algorithms minimize graph weight; timings exclude network/IO.</p>
      </div>}
    </div>}
    {tab==="paths"&&<div className="lab-section">
      <div className="lab-toolbar"><button className="lab-primary" disabled={busy} onClick={()=>execute(async()=>{
        setPaths(await api.labPaths(from,to,3));})}>Find 3 shortest loopless routes</button><small>Yen's algorithm</small></div>
      {paths&&<div className="lab-paths">{paths.routes.length?paths.routes.map((r,i)=>
        <article key={i}><h3>Route {i+1}</h3><RouteView route={r}/></article>):<p>No path found.</p>}</div>}
    </div>}
    {tab==="components"&&<div className="lab-section">
      <div className="lab-toolbar"><button className="lab-primary" disabled={busy} onClick={()=>execute(async()=>{
        setComponents(await api.labComponents());})}>Build SCC condensation DAG</button><small>Tarjan + DSU + topological ordering</small></div>
      {components&&<>{dagNetwork&&<div className="lab-focus-graph lab-dag"><NetworkGraph network={dagNetwork}/></div>}
        <div className="lab-metrics">
        <Metric title="Strong components" value={components.components.length}/>
        <Metric title="Weak components" value={components.weakCount}/>
        <Metric title="Condensation edges" value={components.dagEdges.length}/>
        <Metric title="Topological nodes" value={components.topological.length}/>
      </div><h3>Largest strongly connected regions</h3><div className="lab-components">
        {ranked.map(c=><article key={c.i}><small>SCC #{c.i}</small><b>{c.ids.length} nodes</b>
          <span>{c.ids.slice(0,5).map(id=>byId.get(id)?.formula||id).join(" · ")}</span></article>)}</div>
        <p className="lab-muted">The SCC condensation graph is a DAG. DSU independently calculates weak connected components.</p></>}
    </div>}
    {tab==="bench"&&<div className="lab-section">
      <div className="lab-toolbar"><button className="lab-primary" disabled={busy} onClick={()=>execute(async()=>{
        setCsr(await api.labCsr());})}>Benchmark CSR vs adjacency lists</button></div>
      {csr&&<div className="lab-metrics">
        <Metric title="Adjacency memory" value={csr.adjacencyBytes} unit="bytes"/>
        <Metric title="CSR memory" value={csr.csrBytes} unit="bytes"/>
        <Metric title="Adjacency traversal" value={csr.adjacencyUs} unit="µs"/>
        <Metric title="CSR traversal" value={csr.csrUs} unit="µs"/></div>}
      <div className="lab-generator"><h3>Seeded synthetic graph generator</h3>
        <div className="lab-toolbar"><label>Nodes<input type="number" min="2" max="25000" value={nodeCount} onChange={e=>setNodeCount(Number(e.target.value))}/></label>
          <label>Edges<input type="number" min="1" max="250000" value={edgeCount} onChange={e=>setEdgeCount(Number(e.target.value))}/></label>
          <label>Seed<input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label>
          <button disabled={busy} onClick={()=>execute(async()=>setSynthetic(await api.labSynthetic(nodeCount,edgeCount,seed)))}>Generate and run</button></div>
        {synthetic&&<div className="lab-metrics">
          <Metric title="Reached" value={synthetic.reachable}/>
          <Metric title="Minimum hops" value={synthetic.shortestHops}/>
          <Metric title="BFS" value={synthetic.bfsUs} unit="µs"/>
          <Metric title="Dijkstra" value={synthetic.dijkstraUs} unit="µs"/></div>}
      </div>
    </div>}
    {tab==="trie"&&<div className="lab-section">
      <div className="lab-toolbar"><label>Prefix to traverse
        <input value={trieQuery} onChange={e=>setTrieQuery(e.target.value)} placeholder="Compound prefix"/>
      </label><button className="lab-primary" disabled={busy||!trieQuery.trim()} onClick={()=>execute(async()=>{
        setTrieMatches((await api.search(trieQuery.trim())).matches||[]);
      })}>Search C++ Trie</button></div>
      <div className="lab-trie-flow">{[...trieQuery].map((letter,index)=>
        <div key={index}><small>{index===0?"ROOT →":"↓"}</small><strong>{letter.toLowerCase()}</strong></div>)}</div>
      <p className="lab-muted">Each character follows a hash-map child pointer; terminal and descendant IDs are collected for matching compounds.</p>
      {trieMatches&&<div className="lab-components">
        {trieMatches.map(n=><article key={n.id}><b>{n.formula}</b><span>{n.name}</span></article>)}
        {!trieMatches.length&&<span>No matching prefix</span>}
      </div>}
    </div>}
    {tab==="sandbox"&&<div className="lab-section">
      <div className="lab-toolbar">
        <label>Sandbox operation<select value={editMode} onChange={e=>{setEditMode(e.target.value);setSandbox(null);}}>
          <option value="remove">Remove directed edge</option>
          <option value="replace">Change edge weight</option>
          <option value="add">Add hypothetical directed edge</option>
        </select></label>
        {editMode==="add"?<label>Target for hypothetical edge
          <select value={editTarget} onChange={e=>setEditTarget(e.target.value)}>
            <option value="">Current search destination ({to})</option>
            {(network?.nodes||[]).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>:<label>Existing edge from {from}
          <select value={blocked} onChange={e=>setBlocked(e.target.value)}>
            <option value="">Select an outgoing edge</option>
            {outgoing.map(e=><option key={e.id} value={e.id}>
              {byId.get(e.target)?.name||e.target} · {e.reaction}
            </option>)}
          </select>
        </label>}
        {editMode!=="remove"&&<label>Graph weight
          <input type="number" min="1" max="1000" value={editWeight} onChange={e=>setEditWeight(Number(e.target.value))}/>
        </label>}
        <button className="lab-primary" disabled={busy||(editMode!=="add"&&!blocked)}
          onClick={()=>execute(async()=>{
            if(editMode==="remove"){
              const e=outgoing.find(x=>x.id===blocked);
              if(!e)throw new Error("Select an edge");
              setSandbox(await api.labPlayground(from,to,e.source,e.target,e.reactionId));
            }else{
              const e=outgoing.find(x=>x.id===blocked);
              if(editMode==="replace"&&!e)throw new Error("Select an edge");
              const targetNode=network?.nodes?.find(n=>n.name===to);
              const targetId=editTarget?Number(editTarget):targetNode?.id;
              if(editMode==="add"&&(sourceId===undefined||targetId===undefined))throw new Error("Select two compounds");
              setSandbox(await api.labEdit(from,to,editMode,
                editMode==="add"?sourceId:e.source,
                editMode==="add"?targetId:e.target,
                editMode==="add"?-2:e.reactionId,editWeight));
            }
          })}>Recompute route</button>
      </div>
      <p className="lab-muted">Hypothetical edges are graph-only demonstrations, not real chemical reactions. Original data remains immutable.</p>
      {sandbox&&<RouteView route={sandbox.route}/>}
    </div>}
    <footer className="lab-footer">DSA learning mode · reaction participation graph · not a laboratory synthesis planner</footer>
  </section>;
}
