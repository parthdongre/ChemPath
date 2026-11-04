import { useEffect, useMemo, useRef, useState } from "react";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import {buildCartographicIndex,cartographicVisibility,mapStageForRatio} from "./graphCartography.js";
import GraphLens from "./GraphLens.jsx";
import RouteOverlay from "./RouteOverlay.jsx";
import "./SigmaNetwork.css";

const palette = {
  organic: "#51cbbf", acid: "#ef8f96", ion: "#e6c27c",
  biochemical: "#8dd1a9", salt: "#a5b7d4", base: "#75bde0",
  inorganic: "#9dc6dd", scc: "#89c6e3"
};
const categoryColor = (category) => palette[String(category || "").toLowerCase()] || "#92bbcd";
const prefersReducedMotion=()=>window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches??false;
function animateCamera(camera, state, duration) {
  if(prefersReducedMotion())camera.setState(state);
  else camera.animate(state,{duration});
}
const hash = (value) => {
  let h = 2166136261;
  for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
};

// Stable initial spatialization: no random coordinates, no zeros/NaNs.
// ForceAtlas2 improves clustering; a normalized bounding box guarantees
// that Sigma's initial camera has valid, visible coordinates.
export function buildGraph(network) {
  const graph = new MultiDirectedGraph();
  if (!network?.nodes?.length) return graph;
  const categories = [...new Set(network.nodes.map(n => n.category || "Other"))].sort();
  const byCategory = new Map(categories.map((c, i) => [c, i]));
  const counts = new Map();
  for (const n of network.nodes) {
    const category = n.category || "Other";
    const index = counts.get(category) || 0;
    counts.set(category, index + 1);
    const group = byCategory.get(category);
    const heading = 2 * Math.PI * group / Math.max(1, categories.length);
    const ring = Math.sqrt(index + 1) * 0.065;
    const golden = index * 2.3999632297;
    const x = 0.5 + Math.cos(heading) * 0.3 + Math.cos(golden) * ring;
    const y = 0.5 + Math.sin(heading) * 0.3 + Math.sin(golden) * ring;
    const id = String(n.id);
    graph.addNode(id, {
      x, y, size: 4.7,
      label: n.formula || n.name || id,
      name: n.name || id, formula: n.formula || "", category,
      color: categoryColor(category)
    });
  }
  for (const e of network.edges || []) {
    const source = String(e.source), target = String(e.target);
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
    const key = String(e.id ?? source + "-" + target + "-" + e.reactionId);
    if (graph.hasEdge(key)) continue;
    graph.addDirectedEdgeWithKey(key, source, target, {
      color: "#406478", size: 0.65, reaction: e.reaction || "Reaction",
      equation: e.equation || "", conditions: e.conditions || "",
      cost: e.cost ?? 1, sourceKey: e.sourceKey || ""
    });
  }

  if (graph.order > 1 && graph.size > 0) {
    // Bounded, synchronous layout; avoid expensive long runs in public browsers.
    try {
      forceAtlas2.assign(graph, {
        iterations: graph.order > 750 ? 20 : 45,
        settings: {
          gravity: 1.2, scalingRatio: 5,
          slowDown: 8, barnesHutOptimize: graph.order > 350
        }
      });
    } catch (error) {
      console.warn("ForceAtlas2 layout skipped", error);
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  graph.forEachNode((key, a) => {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
      const h = hash(key);
      graph.setNodeAttribute(key, "x", (h % 1000) / 1000);
      graph.setNodeAttribute(key, "y", ((h >>> 10) % 1000) / 1000);
    }
    const x = graph.getNodeAttribute(key, "x");
    const y = graph.getNodeAttribute(key, "y");
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  });
  const span = Math.max(maxX - minX, maxY - minY, 0.00001);
  graph.forEachNode((key, a) => {
    graph.mergeNodeAttributes(key, {
      x: 0.08 + 0.84 * (a.x - minX) / span,
      y: 0.08 + 0.84 * (a.y - minY) / span
    });
  });
  return graph;
}

export default function SigmaNetwork({
  network, highlightedNodeIds = [], highlightedEdgeIds = [],
  selectedNodeId = null, visitedNodeIds = [], activeNodeId = null,
  simulationRunning = false, onSelectCompound, onExpandNode,
  onSelectEdge, showPopovers = true
}) {
  const container = useRef(null);
  const sigmaRef = useRef(null);
  const graph = useMemo(() => buildGraph(network), [network]);
  const cartography=useMemo(()=>buildCartographicIndex(graph),[graph]);
  const [mapStage,setMapStage]=useState("overview");
  const [showAllLinks,setShowAllLinks]=useState(false);
  const [lensEnabled,setLensEnabled]=useState(false);
  const visibility=useMemo(()=>cartographicVisibility(cartography,{
    stage:mapStage,showAll:showAllLinks,routeNodes:highlightedNodeIds,
    routeEdges:highlightedEdgeIds,selected:selectedNodeId
  }),[cartography,mapStage,showAllLinks,highlightedNodeIds,highlightedEdgeIds,selectedNodeId]);
  const filters = useRef({});
  const [inspected, setInspected] = useState(null);
  const [edgeInfo, setEdgeInfo] = useState(null);
  const [hovered, setHovered] = useState(null);
  const hoveredRef = useRef(null);
  const onSelectRef = useRef(onSelectCompound);
  const onEdgeRef = useRef(onSelectEdge);
  onSelectRef.current = onSelectCompound;
  onEdgeRef.current = onSelectEdge;

  filters.current = {
    highlightedNodes: new Set(highlightedNodeIds.map(String)),
    highlightedEdges: new Set(highlightedEdgeIds.map(String)),
    visited: new Set(visitedNodeIds.map(String)),
    active: activeNodeId == null ? null : String(activeNodeId),
    selected: selectedNodeId == null ? null : String(selectedNodeId),
    simulationRunning, hovered: hoveredRef.current,
    visibility, stage:mapStage, showAll:showAllLinks
  };

  useEffect(() => {
    if (!container.current || !graph.order) return undefined;
    const renderer = new Sigma(graph, container.current, {
      renderEdgeLabels: false,
      renderLabels: true,
      labelDensity: 0.65,
      labelGridCellSize: 94,
      labelRenderedSizeThreshold: 3.8,
      labelFont: "-apple-system, BlinkMacSystemFont, Inter, sans-serif",
      labelWeight: "600",
      labelSize: 12,
      labelColor: {color: "#b3c4ce"},
      hideLabelsOnMove: true,
      hideEdgesOnMove: false,
      zoomingRatio: 1.38,
      defaultNodeColor: "#809ca9",
      defaultEdgeColor: "#344855",
      enableEdgeEvents: true,
      minCameraRatio: 0.035, maxCameraRatio: 16,
      zIndex: true,
      nodeReducer: (key, data) => {
        const f=filters.current,v=f.visibility;
        const highlighted=f.highlightedNodes.has(key);
        const selected=f.selected===key;
        const active=f.active===key;
        const visited=f.visited.has(key);
        const hovered=f.hovered===key;
        const rank=cartography.priority.get(key)??Infinity;
        const shown=v.visibleNodes.has(key)||highlighted||selected||active;
        const hasRoute=v.hasRoute;
        // Like map labels: important landmarks first; minor names at close zoom.
        const labeled=highlighted||selected||active||hovered||
          (hasRoute?rank<9&&shown:f.stage==="overview"?rank<25:
            f.stage==="neighborhood"?rank<100:true);
        const secondary=hasRoute&&!highlighted&&!selected&&!active;
        const size=active?11.5:highlighted?9.2:selected?9.5:
          hovered?8:rank<14?6.5:rank<90?4.7:3.1;
        return {
          ...data,
          hidden:!shown,
          color:active?"#f4da9b":highlighted?"#66e4ce":
            selected?"#efc98e":secondary?"#496574":
            visited?"#85c7be":data.color,
          size:secondary?Math.max(2.5,size*.76):size,
          label:labeled?data.label:"",
          forceLabel:highlighted||selected||active||hovered,
          zIndex:active?12:highlighted?10:selected?9:hovered?7:rank<25?3:0
        };
      },
      edgeReducer: (key,data) => {
        const f=filters.current,v=f.visibility;
        const marked=v.routeEdgeIds.has(key)||f.highlightedEdges.has(key);
        const tier=cartography.tierByEdge.get(key)||"local";
        const background=v.hasRoute&&!marked;
        return {
          ...data,
          hidden:!v.visibleEdges.has(key),
          // Opaque packed colors avoid Chromium/SwiftShader alpha fallbacks.
          color:marked?"#6eead2":background?"#293e4b":
            tier==="arterial"?"#5d7787":tier==="collector"?"#405868":"#304454",
          size:marked?3.35:tier==="arterial"?1.22:tier==="collector"?.78:.53,
          zIndex:marked?12:tier==="arterial"?3:0
        };
      }
    });
    sigmaRef.current = renderer;
    renderer.on("clickNode", ({ node, event }) => {
      const attrs = graph.getNodeAttributes(node);
      setInspected({ id: node, ...attrs });
      setEdgeInfo(null);
      onSelectRef.current?.(attrs.name, Number(node), Boolean(event?.original?.shiftKey));
    });
    renderer.on("clickEdge", ({ edge }) => {
      const record={ ...graph.getEdgeAttributes(edge), id: edge };
      setEdgeInfo(record);
      setInspected(null);
      onEdgeRef.current?.(record);
    });
    renderer.on("doubleClickNode", ({node}) => {
      const data=graph.getNodeAttributes(node);
      renderer.getCamera().animate({x:data.x,y:data.y,ratio:0.28},{duration:310});
    });
    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      setHovered(node);
      container.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null; setHovered(null);
      if (container.current) container.current.style.cursor = "grab";
    });
    // React updates only when the cartographic zoom *stage* changes.
    // Per-pixel camera motion remains on Sigma's renderer, not React.
    const camera=renderer.getCamera();
    const onUpdated=()=>{
      const stage=mapStageForRatio(camera.ratio);
      setMapStage(previous=>previous===stage?previous:stage);
    };
    camera.on("updated",onUpdated);
    // Sigma computes its viewport from these normalized positions.
    camera.setState({x:0.5,y:0.5,ratio:1,angle:0});
    setMapStage("overview");
    renderer.refresh();
    return () => {
      camera.removeListener("updated",onUpdated);
      sigmaRef.current = null;
      renderer.kill();
    };
  }, [graph]); // highlight changes refresh the existing WebGL canvas, not rebuild it.

  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [highlightedNodeIds,highlightedEdgeIds,selectedNodeId,
      visitedNodeIds,activeNodeId,simulationRunning,visibility,mapStage,showAllLinks]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || activeNodeId == null) return;
    const key = String(activeNodeId);
    if (!graph.hasNode(key)) return;
    const { x, y } = graph.getNodeAttributes(key);
    animateCamera(renderer.getCamera(),{x,y,ratio:0.35},260);
  }, [graph, activeNodeId]);

  // A selected route should become the visual center rather than simply
  // changing color somewhere in the full, dense network.
  useEffect(() => {
    const renderer=sigmaRef.current;
    if(!renderer||simulationRunning||highlightedNodeIds.length<2)return;
    const points=highlightedNodeIds.map(String).filter(key=>graph.hasNode(key))
      .map(key=>graph.getNodeAttributes(key));
    if(points.length<2)return;
    const bounds={
      minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))
    };
    const size=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY);
    const camera=renderer.getCamera();
    const state={
      x:(bounds.minX+bounds.maxX)/2,
      y:(bounds.minY+bounds.maxY)/2,
      ratio:Math.max(0.19,Math.min(1.25,size*1.8))
    };
    animateCamera(camera,state,340);
  },[graph,highlightedNodeIds,simulationRunning]);

  return <div className="sigma-shell cartographic-graph" data-map-stage={mapStage}
    data-graph-detail={showAllLinks?"all":"adaptive"}>
    <div className="sigma-toolbar studio-liquid-glass" data-liquid-glass="true">
      <div className="sigma-map-modes" role="group" aria-label="Graph rendering detail">
        <button type="button" aria-pressed={!showAllLinks} className={!showAllLinks?"selected":""}
          onClick={()=>setShowAllLinks(false)} title="Map-like clarity with progressive detail">Map clarity</button>
        <button type="button" aria-pressed={showAllLinks} className={showAllLinks?"selected":""}
          onClick={()=>setShowAllLinks(true)} title="Show every graph edge regardless of zoom">All links</button>
      </div>
      <button type="button" aria-pressed={lensEnabled}
        className={"sigma-lens-toggle"+(lensEnabled?" selected":"")}
        title="Inspect the underlying network through a magnifying glass"
        aria-label="Focus lens" onClick={()=>setLensEnabled(value=>!value)}>
        Lens
      </button>
      <span className="sigma-toolbar-divider" aria-hidden="true"></span>
      <button type="button" aria-label="Fit network" title="Fit network"
        onClick={()=>animateCamera(sigmaRef.current?.getCamera(),{
          x:0.5,y:0.5,ratio:1,angle:0
        },270)}>Fit</button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={()=>{
        const camera=sigmaRef.current?.getCamera();
        if(camera)animateCamera(camera,{ratio:Math.max(.035,camera.ratio/1.5)},220);
      }}>+</button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={()=>{
        const camera=sigmaRef.current?.getCamera();
        if(camera)animateCamera(camera,{ratio:Math.min(16,camera.ratio*1.5)},220);
      }}>−</button>
    </div>
    <div className="sigma-canvas" ref={container} role="img"
      aria-label={"Reaction network: " + graph.order + " compounds, " + graph.size + " directed edges"} />
    <RouteOverlay graph={graph} rendererRef={sigmaRef}
      routeNodes={highlightedEdgeIds.length?highlightedNodeIds:[]}
      routeEdges={highlightedEdgeIds}/>
    <GraphLens enabled={lensEnabled} containerRef={container} rendererRef={sigmaRef}
      graph={graph} cartography={cartography}
      highlightedEdgeIds={highlightedEdgeIds} selectedNodeId={selectedNodeId}/>
    <div className="sigma-footnote studio-liquid-glass" data-liquid-glass="true" role="status">
      <strong>{visibility.mode}</strong>
      <span>{visibility.visibleNodes.size.toLocaleString()}/{graph.order.toLocaleString()} compounds ·
        {" "}{visibility.visibleEdges.size.toLocaleString()}/{graph.size.toLocaleString()} drawn links</span>
      {hovered&&graph.hasNode(hovered)&&<span> · {graph.getNodeAttribute(hovered,"name")}</span>}
      <small>{showAllLinks?"Every participation edge drawn":"Visual simplification only · zoom for more detail"}</small>
    </div>
    {showPopovers && (inspected || edgeInfo) && <div className="sigma-inspector">
      <button type="button" className="sigma-close" onClick={() => { setInspected(null); setEdgeInfo(null); }}
        aria-label="Close inspector">×</button>
      <small>{edgeInfo ? "REACTION EDGE" : "COMPOUND"}</small>
      <strong>{edgeInfo ? edgeInfo.reaction : inspected.formula || inspected.name}</strong>
      <p>{edgeInfo ? edgeInfo.equation || "Directed reaction participation" : inspected.name}</p>
      {edgeInfo ? <p>{edgeInfo.conditions}</p> : <>
        <p>{inspected.category}</p>
        {onExpandNode && <button type="button" className="sigma-expand"
          onClick={() => onExpandNode(inspected.id, inspected.name)}>Expand neighborhood</button>}
      </>}
    </div>}
  </div>;
}
