import { useEffect, useMemo, useRef, useState } from "react";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import "./SigmaNetwork.css";

const palette = {
  organic: "#51cbbf", acid: "#ef8f96", ion: "#e6c27c",
  biochemical: "#8dd1a9", salt: "#a5b7d4", base: "#75bde0",
  inorganic: "#9dc6dd", scc: "#89c6e3"
};
const categoryColor = (category) => palette[String(category || "").toLowerCase()] || "#92bbcd";
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
  simulationRunning = false, onSelectCompound, onExpandNode
}) {
  const container = useRef(null);
  const sigmaRef = useRef(null);
  const graph = useMemo(() => buildGraph(network), [network]);
  const filters = useRef({});
  const [inspected, setInspected] = useState(null);
  const [edgeInfo, setEdgeInfo] = useState(null);
  const [hovered, setHovered] = useState(null);
  const hoveredRef = useRef(null);
  const onSelectRef = useRef(onSelectCompound);
  onSelectRef.current = onSelectCompound;

  filters.current = {
    highlightedNodes: new Set(highlightedNodeIds.map(String)),
    highlightedEdges: new Set(highlightedEdgeIds.map(String)),
    visited: new Set(visitedNodeIds.map(String)),
    active: activeNodeId == null ? null : String(activeNodeId),
    selected: selectedNodeId == null ? null : String(selectedNodeId),
    simulationRunning, hovered: hoveredRef.current
  };

  useEffect(() => {
    if (!container.current || !graph.order) return undefined;
    const renderer = new Sigma(graph, container.current, {
      renderEdgeLabels: false,
      labelDensity: 0.05,
      labelGridCellSize: 85,
      labelRenderedSizeThreshold: 4,
      defaultNodeColor: "#79c5d3",
      defaultEdgeColor: "#406478",
      enableEdgeEvents: true,
      minCameraRatio: 0.035, maxCameraRatio: 16,
      zIndex: true,
      nodeReducer: (key, data) => {
        const f = filters.current;
        const highlighted = f.highlightedNodes.has(key);
        const active = f.active === key;
        const selected = f.selected === key;
        const visited = f.visited.has(key);
        const hasPath = f.highlightedNodes.size > 0 || f.highlightedEdges.size > 0;
        const dim = (f.simulationRunning && !active && !visited && !selected) ||
          (!f.simulationRunning && hasPath && !highlighted && !selected);
        return {
          ...data,
          color: active ? "#fff0be" : highlighted ? "#ff667a" :
            selected ? "#f4d89b" : visited ? "#62e0d0" : data.color,
          size: active ? 12 : highlighted ? 9 : selected ? 8.2 : visited ? 6.6 : data.size,
          hidden: false,
          label: (dim && !active) ? "" : data.label,
          zIndex: active ? 10 : highlighted ? 8 : selected ? 7 : visited ? 5 : 0
        };
      },
      edgeReducer: (key, data) => {
        const f = filters.current;
        const marked = f.highlightedEdges.has(key);
        const hasPath = f.highlightedNodes.size > 0 || f.highlightedEdges.size > 0;
        return {
          ...data,
          color: marked ? "#fb6075" : hasPath || f.simulationRunning ? "#23445a" : data.color,
          size: marked ? 3.6 : data.size,
          zIndex: marked ? 10 : 0
        };
      }
    });
    sigmaRef.current = renderer;
    renderer.on("clickNode", ({ node }) => {
      const attrs = graph.getNodeAttributes(node);
      setInspected({ id: node, ...attrs });
      setEdgeInfo(null);
      onSelectRef.current?.(attrs.name, Number(node));
    });
    renderer.on("clickEdge", ({ edge }) => {
      setEdgeInfo({ ...graph.getEdgeAttributes(edge), id: edge });
      setInspected(null);
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
    // Sigma computes its viewport from these normalized positions.
    renderer.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    renderer.refresh();
    return () => {
      sigmaRef.current = null;
      renderer.kill();
    };
  }, [graph]); // highlight changes refresh the existing WebGL canvas, not rebuild it.

  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [highlightedNodeIds, highlightedEdgeIds, selectedNodeId,
      visitedNodeIds, activeNodeId, simulationRunning]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || activeNodeId == null) return;
    const key = String(activeNodeId);
    if (!graph.hasNode(key)) return;
    const { x, y } = graph.getNodeAttributes(key);
    renderer.getCamera().animate({ x, y, ratio: 0.35 }, { duration: 260 });
  }, [graph, activeNodeId]);

  return <div className="sigma-shell">
    <div className="sigma-toolbar">
      <span>WebGL · Sigma.js</span>
      <button type="button" onClick={() => sigmaRef.current?.getCamera()
        .animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 260 })}>
        Fit network
      </button>
      <button type="button" onClick={() => sigmaRef.current?.getCamera()
        .animate({ ratio: Math.max(0.035, sigmaRef.current.getCamera().ratio / 1.5) }, { duration: 220 })}>+</button>
      <button type="button" onClick={() => sigmaRef.current?.getCamera()
        .animate({ ratio: Math.min(16, sigmaRef.current.getCamera().ratio * 1.5) }, { duration: 220 })}>−</button>
    </div>
    <div className="sigma-canvas" ref={container} role="img"
      aria-label={"Reaction network: " + graph.order + " compounds, " + graph.size + " directed edges"} />
    <div className="sigma-footnote">
      {graph.order.toLocaleString()} visible compounds · {graph.size.toLocaleString()} edges
      {hovered && graph.hasNode(hovered) && <span> · {graph.getNodeAttribute(hovered, "name")}</span>}
    </div>
    {(inspected || edgeInfo) && <div className="sigma-inspector">
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
