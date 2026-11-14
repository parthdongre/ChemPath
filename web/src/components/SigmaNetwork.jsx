import { useEffect, useMemo, useRef, useState } from "react";
import { MultiDirectedGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { Maximize2, Minus, Plus, ScanSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Hint, MapPanel } from "@/components/studio/primitives.jsx";
import {
  buildCartographicIndex,
  cartographicVisibility,
  mapStageForRatio
} from "./graphCartography.js";
import { categoryColor, compoundLabel, graphTheme, useTheme } from "../theme.js";
import GraphLens from "./GraphLens.jsx";
import RouteOverlay from "./RouteOverlay.jsx";
import { buildOverviewClusters } from "./graphClusters.js";
import ClusterOverlay from "./ClusterOverlay.jsx";
import { layoutKey, restoreLayout, rememberLayout } from "./graphLayoutCache.js";
import "./SigmaNetwork.css";

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
function animateCamera(camera, state, duration) {
  if (prefersReducedMotion()) camera.setState(state);
  else camera.animate(state, { duration });
}
const hash = value => {
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
    const heading = (2 * Math.PI * group) / Math.max(1, categories.length);
    const ring = Math.sqrt(index + 1) * 0.065;
    const golden = index * 2.3999632297;
    const x = 0.5 + Math.cos(heading) * 0.3 + Math.cos(golden) * ring;
    const y = 0.5 + Math.sin(heading) * 0.3 + Math.sin(golden) * ring;
    const id = String(n.id);
    graph.addNode(id, {
      x,
      y,
      size: 4.7,
      label: compoundLabel(n) || id,
      name: n.name || id,
      formula: n.formula || "",
      category,
      color: categoryColor("dark", category)
    });
  }
  for (const e of network.edges || []) {
    const source = String(e.source),
      target = String(e.target);
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue;
    const key = String(e.id ?? source + "-" + target + "-" + e.reactionId);
    if (graph.hasEdge(key)) continue;
    graph.addDirectedEdgeWithKey(key, source, target, {
      color: "#406478",
      size: 0.65,
      reaction: e.reaction || "Reaction",
      equation: e.equation || "",
      conditions: e.conditions || "",
      cost: e.cost ?? 1,
      sourceKey: e.sourceKey || ""
    });
  }

  const cacheKey = layoutKey(network);
  if (restoreLayout(cacheKey, graph)) return graph;
  if (graph.order > 1 && graph.size > 0) {
    // Bounded, synchronous layout; avoid expensive long runs in public browsers.
    try {
      forceAtlas2.assign(graph, {
        iterations: graph.order > 750 ? 20 : 45,
        settings: {
          gravity: 1.2,
          scalingRatio: 5,
          slowDown: 8,
          barnesHutOptimize: graph.order > 350
        }
      });
    } catch (error) {
      console.warn("ForceAtlas2 layout skipped", error);
    }
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  graph.forEachNode((key, a) => {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
      const h = hash(key);
      graph.setNodeAttribute(key, "x", (h % 1000) / 1000);
      graph.setNodeAttribute(key, "y", ((h >>> 10) % 1000) / 1000);
    }
    const x = graph.getNodeAttribute(key, "x");
    const y = graph.getNodeAttribute(key, "y");
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  const span = Math.max(maxX - minX, maxY - minY, 0.00001);
  graph.forEachNode((key, a) => {
    graph.mergeNodeAttributes(key, {
      x: 0.08 + (0.84 * (a.x - minX)) / span,
      y: 0.08 + (0.84 * (a.y - minY)) / span
    });
  });
  rememberLayout(cacheKey, graph);
  return graph;
}

export default function SigmaNetwork({
  network,
  highlightedNodeIds = [],
  highlightedEdgeIds = [],
  selectedNodeId = null,
  visitedNodeIds = [],
  activeNodeId = null,
  simulationRunning = false,
  onSelectCompound,
  onExpandNode,
  onSelectEdge,
  showPopovers = true
}) {
  const container = useRef(null);
  const sigmaRef = useRef(null);
  const zoomTarget = useRef(null);
  const theme = useTheme();
  const colors = graphTheme(theme);
  const graph = useMemo(() => buildGraph(network), [network]);
  const cartography = useMemo(() => buildCartographicIndex(graph), [graph]);
  const [mapStage, setMapStage] = useState("overview");
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [lensEnabled, setLensEnabled] = useState(false);
  const visibility = useMemo(
    () =>
      cartographicVisibility(cartography, {
        stage: mapStage,
        showAll: showAllLinks,
        routeNodes: highlightedNodeIds,
        routeEdges: highlightedEdgeIds,
        selected: selectedNodeId
      }),
    [cartography, mapStage, showAllLinks, highlightedNodeIds, highlightedEdgeIds, selectedNodeId]
  );
  const clustersInfo = useMemo(() => {
    if (mapStage !== "overview" || showAllLinks || visibility.hasRoute)
      return { clusters: [], hiddenNodeIds: new Set() };
    return buildOverviewClusters(graph, cartography, visibility.visibleNodes);
  }, [graph, cartography, mapStage, showAllLinks, visibility]);
  const displayedEdges = useMemo(
    () =>
      cartography.entries.filter(
        edge =>
          visibility.visibleEdges.has(edge.id) &&
          !clustersInfo.hiddenNodeIds.has(edge.source) &&
          !clustersInfo.hiddenNodeIds.has(edge.target)
      ).length,
    [cartography, visibility, clustersInfo]
  );
  const filters = useRef({});
  const [inspected, setInspected] = useState(null);
  const [edgeInfo, setEdgeInfo] = useState(null);
  const [hovered, setHovered] = useState(null);
  const hoveredRef = useRef(null);
  const lastFocusedSelection = useRef(null);
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
    simulationRunning,
    hovered: hoveredRef.current,
    visibility,
    stage: mapStage,
    showAll: showAllLinks,
    clusterHidden: clustersInfo.hiddenNodeIds,
    theme,
    colors
  };

  useEffect(() => {
    if (!container.current || !graph.order) return undefined;
    const renderer = new Sigma(graph, container.current, {
      renderEdgeLabels: false,
      renderLabels: true,
      labelDensity: 0.65,
      labelGridCellSize: 94,
      labelRenderedSizeThreshold: 3.8,
      labelFont: "'Geist Variable', -apple-system, BlinkMacSystemFont, sans-serif",
      labelWeight: "500",
      labelSize: 12,
      labelColor: { color: filters.current.colors.label },
      hideLabelsOnMove: true,
      hideEdgesOnMove: false,
      zoomingRatio: 1.38,
      defaultNodeColor: filters.current.colors.nodeMuted,
      defaultEdgeColor: filters.current.colors.edgeLocal,
      enableEdgeEvents: true,
      // Sigma's default hover draws a white card, unreadable with light labels.
      defaultDrawNodeHover: (context, data, settings) => {
        const c = filters.current.colors;
        const size = settings.labelSize;
        context.font = `600 ${size}px ${settings.labelFont}`;
        context.beginPath();
        context.arc(data.x, data.y, data.size + 3.5, 0, Math.PI * 2);
        context.fillStyle = c.hoverLine;
        context.fill();
        if (!data.label) return;
        const width = context.measureText(data.label).width;
        const x = data.x + data.size + 7,
          y = data.y;
        context.beginPath();
        if (context.roundRect) context.roundRect(x - 6, y - size / 2 - 5, width + 12, size + 10, 5);
        else context.rect(x - 6, y - size / 2 - 5, width + 12, size + 10);
        context.fillStyle = c.hoverBg;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = c.hoverLine;
        context.stroke();
        context.fillStyle = c.hoverInk;
        context.fillText(data.label, x, y + size / 3);
      },
      minCameraRatio: 0.035,
      maxCameraRatio: 16,
      zIndex: true,
      nodeReducer: (key, data) => {
        const f = filters.current,
          v = f.visibility;
        const highlighted = f.highlightedNodes.has(key);
        const selected = f.selected === key;
        const active = f.active === key;
        const visited = f.visited.has(key);
        const hovered = f.hovered === key;
        const rank = cartography.priority.get(key) ?? Infinity;
        const shown = v.visibleNodes.has(key) || highlighted || selected || active;
        const hasRoute = v.hasRoute;
        // Like map labels: important landmarks first; minor names at close zoom.
        const labeled =
          highlighted ||
          selected ||
          active ||
          hovered ||
          (hasRoute
            ? rank < 9 && shown
            : f.stage === "overview"
              ? rank < 25
              : f.stage === "neighborhood"
                ? rank < 100
                : true);
        const secondary = hasRoute && !highlighted && !selected && !active;
        const size = active
          ? 11.5
          : highlighted
            ? 9.2
            : selected
              ? 9.5
              : hovered
                ? 8
                : rank < 14
                  ? 6.5
                  : rank < 90
                    ? 4.7
                    : 3.1;
        const c = f.colors;
        return {
          ...data,
          hidden: !shown || (!highlighted && !selected && !active && f.clusterHidden.has(key)),
          color: active
            ? c.active
            : highlighted
              ? c.route
              : selected
                ? c.selected
                : secondary
                  ? c.nodeMuted
                  : visited
                    ? c.visited
                    : categoryColor(f.theme, data.category),
          size: secondary ? Math.max(2.5, size * 0.76) : size,
          label: labeled ? data.label : "",
          forceLabel: highlighted || selected || active || hovered,
          zIndex: active ? 12 : highlighted ? 10 : selected ? 9 : hovered ? 7 : rank < 25 ? 3 : 0
        };
      },
      edgeReducer: (key, data) => {
        const f = filters.current,
          v = f.visibility;
        const marked = v.routeEdgeIds.has(key) || f.highlightedEdges.has(key);
        const tier = cartography.tierByEdge.get(key) || "local";
        const background = v.hasRoute && !marked;
        const c = f.colors;
        return {
          ...data,
          hidden:
            !v.visibleEdges.has(key) ||
            f.clusterHidden.has(graph.source(key)) ||
            f.clusterHidden.has(graph.target(key)),
          // Opaque packed colors avoid Chromium/SwiftShader alpha fallbacks.
          color: marked
            ? c.route
            : background
              ? c.edgeMuted
              : tier === "arterial"
                ? c.edgeArterial
                : tier === "collector"
                  ? c.edgeCollector
                  : c.edgeLocal,
          size: marked ? 3.35 : tier === "arterial" ? 1.22 : tier === "collector" ? 0.78 : 0.53,
          zIndex: marked ? 12 : tier === "arterial" ? 3 : 0
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
      const record = { ...graph.getEdgeAttributes(edge), id: edge };
      setEdgeInfo(record);
      setInspected(null);
      onEdgeRef.current?.(record);
    });
    renderer.on("doubleClickNode", ({ node }) => {
      const data = graph.getNodeAttributes(node);
      renderer.getCamera().animate({ x: data.x, y: data.y, ratio: 0.28 }, { duration: 310 });
    });
    renderer.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      setHovered(node);
      container.current.style.cursor = "pointer";
    });
    renderer.on("leaveNode", () => {
      hoveredRef.current = null;
      setHovered(null);
      if (container.current) container.current.style.cursor = "grab";
    });
    // React updates only when the cartographic zoom *stage* changes.
    // Per-pixel camera motion remains on Sigma's renderer, not React.
    const camera = renderer.getCamera();
    const onUpdated = () => {
      const stage = mapStageForRatio(camera.ratio);
      setMapStage(previous => (previous === stage ? previous : stage));
    };
    camera.on("updated", onUpdated);
    // Sigma computes its viewport from these normalized positions.
    camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    setMapStage("overview");
    renderer.refresh();
    return () => {
      camera.removeListener("updated", onUpdated);
      sigmaRef.current = null;
      renderer.kill();
    };
  }, [graph, cartography]); // cartography derives from graph; highlight changes refresh the existing WebGL canvas, not rebuild it.

  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [
    highlightedNodeIds,
    highlightedEdgeIds,
    selectedNodeId,
    visitedNodeIds,
    activeNodeId,
    simulationRunning,
    visibility,
    mapStage,
    showAllLinks,
    clustersInfo
  ]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    renderer.setSetting("labelColor", { color: colors.label });
    renderer.setSetting("defaultNodeColor", colors.nodeMuted);
    renderer.setSetting("defaultEdgeColor", colors.edgeLocal);
    renderer.refresh();
  }, [colors]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || activeNodeId == null) return;
    const key = String(activeNodeId);
    if (!graph.hasNode(key)) return;
    const { x, y } = graph.getNodeAttributes(key);
    animateCamera(renderer.getCamera(), { x, y, ratio: 0.35 }, 260);
  }, [graph, activeNodeId]);

  // Choosing a compound behaves like searching a place on a map:
  // center it only on a *new* selection, never override initial overview or
  // the user's own camera pan / route navigation.
  useEffect(() => {
    if (selectedNodeId == null || !graph.order) return;
    const key = String(selectedNodeId);
    if (lastFocusedSelection.current == null) {
      lastFocusedSelection.current = key;
      return;
    }
    if (lastFocusedSelection.current === key) return;
    lastFocusedSelection.current = key;
    if (highlightedEdgeIds.length || !graph.hasNode(key)) return;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const { x, y } = graph.getNodeAttributes(key);
    animateCamera(
      renderer.getCamera(),
      {
        x,
        y,
        ratio: Math.min(0.5, renderer.getCamera().ratio)
      },
      320
    );
  }, [graph, selectedNodeId, highlightedEdgeIds]);

  // Fit the whole returned route using Sigma's *framed* graph coordinates,
  // not raw graph x/y (these are not the same coordinate system).
  // Pixel-space projection ensures every reaction waypoint has breathing room,
  // including after a desktop window/inspector resize.
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (
      !renderer ||
      simulationRunning ||
      highlightedNodeIds.length < 2 ||
      highlightedEdgeIds.length < 1
    )
      return undefined;
    const points = highlightedNodeIds
      .map(String)
      .filter(key => graph.hasNode(key))
      .map(key => graph.getNodeAttributes(key));
    if (points.length < 2) return undefined;

    const fit = () => {
      const liveRenderer = sigmaRef.current;
      if (!liveRenderer) return;
      const { width, height } = liveRenderer.getDimensions();
      if (width < 100 || height < 100) return;
      // sigma@3's normalized framed coordinates are derived from its bbox.
      // Avoid newer Sigma APIs unavailable in the pinned 3.x package.
      const bbox = liveRenderer.getBBox();
      const centerX = (bbox.x[0] + bbox.x[1]) / 2;
      const centerY = (bbox.y[0] + bbox.y[1]) / 2;
      const span = Math.max(bbox.x[1] - bbox.x[0], bbox.y[1] - bbox.y[0], 1e-6);
      const framed = points.map(point => ({
        x: 0.5 + (point.x - centerX) / span,
        y: 0.5 + (point.y - centerY) / span
      }));
      const x = (Math.min(...framed.map(p => p.x)) + Math.max(...framed.map(p => p.x))) / 2;
      const y = (Math.min(...framed.map(p => p.y)) + Math.max(...framed.map(p => p.y))) / 2;
      const padX = Math.min(100, Math.max(40, width * 0.12));
      const padY = Math.min(120, Math.max(48, height * 0.17));
      const usableWidth = Math.max(100, width - 2 * padX);
      const usableHeight = Math.max(100, height - 2 * padY);
      let ratio = 0.25;
      // 5 attempts, at most 2N projections each, on selection/resize only.
      for (let pass = 0; pass < 5; pass++) {
        const cameraState = { x, y, ratio, angle: 0 };
        const projected = points.map(point =>
          liveRenderer.graphToViewport({ x: point.x, y: point.y }, { cameraState })
        );
        const spanX = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x));
        const spanY = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y));
        const factor = Math.max(spanX / usableWidth, spanY / usableHeight);
        if (!Number.isFinite(factor) || factor <= 1) break;
        ratio = Math.min(6, ratio * Math.max(1.06, factor * 1.06));
      }
      animateCamera(liveRenderer.getCamera(), { x, y, ratio, angle: 0 }, 340);
    };

    fit();
    let frame = 0;
    let lastWidth = 0,
      lastHeight = 0;
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            // Wait until Sigma has measured the new viewport.
            const renderer = sigmaRef.current;
            if (!renderer) return;
            const { width, height } = renderer.getDimensions();
            if (width === lastWidth && height === lastHeight) return;
            lastWidth = width;
            lastHeight = height;
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              frame = 0;
              fit();
            });
          })
        : null;
    if (resizeObserver && container.current) resizeObserver.observe(container.current);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [graph, highlightedNodeIds, highlightedEdgeIds, simulationRunning]);

  // Repeated clicks compound from the pending target, not the mid-animation ratio.
  const zoomBy = factor => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    const base =
      camera.isAnimated?.() && zoomTarget.current != null ? zoomTarget.current : camera.ratio;
    const next = Math.max(0.035, Math.min(16, base * factor));
    zoomTarget.current = next;
    animateCamera(camera, { ratio: next }, 220);
  };
  const shownNodes = visibility.visibleNodes.size - clustersInfo.hiddenNodeIds.size;
  const hoveredName =
    hovered && graph.hasNode(hovered) ? graph.getNodeAttribute(hovered, "name") : null;

  return (
    <div
      className="sigma-shell cartographic-graph"
      data-map-stage={mapStage}
      data-graph-detail={showAllLinks ? "all" : "adaptive"}
    >
      <MapPanel
        className="sigma-toolbar top-3 right-3 gap-0.5 max-md:top-14"
        role="toolbar"
        aria-label="Map controls"
      >
        <ButtonGroup aria-label="Graph rendering detail">
          <Hint label="Strongest links only; minor compounds grouped">
            <Button
              size="sm"
              variant={!showAllLinks ? "secondary" : "ghost"}
              aria-pressed={!showAllLinks}
              className={!showAllLinks ? "selected" : ""}
              onClick={() => setShowAllLinks(false)}
            >
              Overview
            </Button>
          </Hint>
          <Hint label="Draw every participation edge">
            <Button
              size="sm"
              variant={showAllLinks ? "secondary" : "ghost"}
              aria-pressed={showAllLinks}
              className={showAllLinks ? "selected" : ""}
              onClick={() => setShowAllLinks(true)}
            >
              All links
            </Button>
          </Hint>
        </ButtonGroup>
        <Separator orientation="vertical" className="mx-0.5 h-4 self-center" />
        <Hint label="Magnifier lens">
          <Button
            size="icon-sm"
            variant={lensEnabled ? "secondary" : "ghost"}
            aria-pressed={lensEnabled}
            aria-label="Focus lens"
            className={lensEnabled ? "text-route" : ""}
            onClick={() => setLensEnabled(value => !value)}
          >
            <ScanSearch />
          </Button>
        </Hint>
        <Hint label="Fit network">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Fit network"
            onClick={() =>
              animateCamera(
                sigmaRef.current?.getCamera(),
                { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
                270
              )
            }
          >
            <Maximize2 />
          </Button>
        </Hint>
        <Hint label="Zoom in">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => zoomBy(1 / 1.5)}
          >
            <Plus />
          </Button>
        </Hint>
        <Hint label="Zoom out">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => zoomBy(1.5)}>
            <Minus />
          </Button>
        </Hint>
      </MapPanel>
      <div
        className="sigma-canvas"
        ref={container}
        role="img"
        aria-label={
          "Reaction network: " + graph.order + " compounds, " + graph.size + " directed edges"
        }
      />
      <ClusterOverlay clusters={clustersInfo.clusters} rendererRef={sigmaRef} />
      <RouteOverlay
        graph={graph}
        rendererRef={sigmaRef}
        routeNodes={highlightedEdgeIds.length ? highlightedNodeIds : []}
        routeEdges={highlightedEdgeIds}
      />
      <GraphLens
        enabled={lensEnabled}
        containerRef={container}
        rendererRef={sigmaRef}
        graph={graph}
        cartography={cartography}
        highlightedEdgeIds={highlightedEdgeIds}
        selectedNodeId={selectedNodeId}
      />
      <MapPanel
        role="status"
        className="sigma-footnote pointer-events-none bottom-3 left-3 max-w-[calc(100%-1.5rem)]
      flex-wrap px-1 py-1 text-[11.5px] text-muted-foreground tabular-nums"
      >
        <span className="px-2 font-medium text-foreground">{visibility.mode}</span>
        <span className="border-l px-2">
          {shownNodes.toLocaleString()}/{graph.order.toLocaleString()} compounds
        </span>
        <span className="border-l px-2 max-sm:hidden">
          {displayedEdges.toLocaleString()}/{graph.size.toLocaleString()} drawn links
        </span>
        {clustersInfo.clusters.length > 0 && (
          <span className="border-l px-2 max-sm:hidden">{clustersInfo.clusters.length} groups</span>
        )}
        {hoveredName && <span className="border-l px-2 text-route">{hoveredName}</span>}
      </MapPanel>
      {showPopovers && (inspected || edgeInfo) && (
        <Card
          size="sm"
          className="sigma-inspector absolute bottom-14 left-3 z-20 w-[min(320px,calc(100%-1.5rem))] gap-2 shadow-lg"
        >
          <CardHeader>
            <CardDescription>{edgeInfo ? "Reaction" : "Compound"}</CardDescription>
            <CardTitle className="break-words">
              {edgeInfo ? edgeInfo.reaction : inspected.label || inspected.name}
            </CardTitle>
            <CardAction>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Close inspector"
                onClick={() => {
                  setInspected(null);
                  setEdgeInfo(null);
                }}
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1 text-[13px] text-muted-foreground">
            {edgeInfo ? (
              <>
                <p className="font-mono text-xs break-all">
                  {edgeInfo.equation || "Directed reaction participation"}
                </p>
                {edgeInfo.conditions && <p>{edgeInfo.conditions}</p>}
              </>
            ) : (
              <>
                <p className="break-all">{inspected.name}</p>
                <p>{inspected.category}</p>
                {onExpandNode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onExpandNode(inspected.id, inspected.name)}
                  >
                    Show neighborhood
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
