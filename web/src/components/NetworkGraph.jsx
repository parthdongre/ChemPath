import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import dagre from "cytoscape-dagre";
cytoscape.use(fcose);
cytoscape.use(dagre);
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { categoryColor, compoundLabel, graphTheme, useTheme } from "../theme.js";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { MapPanel } from "@/components/studio/primitives.jsx";

function cytoscapeStyle(theme) {
  const c = graphTheme(theme);
  const light = theme === "light";
  const ink = light ? "#1b1a17" : "#ececea";
  const surface = light ? "#fbfaf8" : "#16171a";
  const categories = [
    "organic",
    "acid",
    "ion",
    "biochemical",
    "salt",
    "base",
    "inorganic",
    "scc"
  ].map(name => ({
    selector: `node.category-${name}`,
    style: { "background-color": categoryColor(theme, name) }
  }));
  return [
    {
      selector: "node",
      style: {
        "background-color": categoryColor(theme, "other"),
        "border-color": surface,
        "border-width": 2,
        label: "data(label)",
        color: ink,
        "font-size": 12.5,
        "font-weight": 500,
        "font-family": "'Geist Variable', -apple-system, BlinkMacSystemFont, sans-serif",
        width: 22,
        height: 22,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 5,
        "text-outline-color": c.canvas,
        "text-outline-width": 2,
        "min-zoomed-font-size": 7
      }
    },
    ...categories,
    {
      selector: "edge",
      style: {
        width: 1.4,
        "line-color": c.edgeArterial,
        "target-arrow-color": c.edgeArterial,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        // Straight edges: bezier fans parallel reaction edges into ribbons.
        "curve-style": "straight",
        opacity: 0.55
      }
    },
    { selector: ".simulation-dim", style: { opacity: 0.16 } },
    {
      selector: "node.visited",
      style: { opacity: 1, "background-color": c.visited }
    },
    {
      selector: "node.active",
      style: {
        opacity: 1,
        width: 36,
        height: 36,
        "font-size": 14,
        label: "data(fullLabel)",
        "text-wrap": "wrap",
        "text-max-width": 120,
        "background-color": c.active,
        "border-color": ink,
        "border-width": 2.5,
        "font-weight": 600,
        "z-index": 30
      }
    },
    { selector: ".dimmed", style: { opacity: 0.12 } },
    // Visited but off the final route: keep context without hiding the answer.
    { selector: ".faded", style: { opacity: 0.22 } },
    {
      selector: "node.highlighted",
      style: {
        opacity: 1,
        width: 28,
        height: 28,
        "font-size": 13,
        label: "data(fullLabel)",
        "text-wrap": "wrap",
        "text-max-width": 120,
        "border-color": c.route,
        "border-width": 3,
        "font-weight": 600,
        "z-index": 25
      }
    },
    {
      selector: "edge.highlighted",
      style: {
        opacity: 1,
        width: 5,
        "line-color": c.route,
        "target-arrow-color": c.route,
        "arrow-scale": 1.3,
        label: "data(reaction)",
        color: ink,
        "font-family": "'Geist Variable', -apple-system, BlinkMacSystemFont, sans-serif",
        "font-size": 13,
        "font-weight": 600,
        "text-background-color": surface,
        "text-background-opacity": 1,
        "text-background-padding": 6,
        "text-background-shape": "roundrectangle",
        "text-border-color": c.route,
        "text-border-width": 1.5,
        "text-border-opacity": 1,
        "text-rotation": "none",
        "text-margin-y": -14,
        "z-index": 25
      }
    },
    {
      // The reaction a traversal is examining right now, e.g. a Dijkstra relax.
      selector: "edge.active-edge",
      style: {
        opacity: 1,
        width: 6,
        "line-color": c.active,
        "target-arrow-color": c.active,
        "arrow-scale": 1.4,
        "line-style": "solid",
        label: "data(reaction)",
        color: ink,
        "font-family": "'Geist Variable', -apple-system, BlinkMacSystemFont, sans-serif",
        "font-size": 14,
        "font-weight": 600,
        "text-background-color": surface,
        "text-background-opacity": 1,
        "text-background-padding": 7,
        "text-background-shape": "roundrectangle",
        "text-border-color": c.active,
        "text-border-width": 2,
        "text-border-opacity": 1,
        "text-rotation": "none",
        "text-margin-y": -16,
        "z-index": 40
      }
    },
    { selector: ".selected", style: { "border-width": 3, "border-color": c.selected } }
  ];
}

const categoryClass = (category = "") =>
  `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default function NetworkGraph({
  network,
  highlightedNodeIds = [],
  highlightedEdgeIds = [],
  selectedNodeId = null,
  visitedNodeIds = [],
  activeNodeId = null,
  activeEdgeIds = [],
  simulationRunning = false
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const positionsRef = useRef(new Map());
  const viewportRef = useRef(null);
  const [layoutMode, setLayoutMode] = useState("fcose");
  const theme = useTheme();
  const [inspected, setInspected] = useState(null);
  const [inspectedEdge, setInspectedEdge] = useState(null);

  const elements = useMemo(() => {
    if (!network) return [];

    const nodes = network.nodes.map(node => ({
      position: positionsRef.current.get(String(node.id)),
      data: {
        id: String(node.id),
        label: compoundLabel(node) || node.name,
        fullLabel: `${compoundLabel(node) || "?"}\n${node.name}`,
        name: node.name,
        formula: node.formula,
        category: node.category
      },
      classes: categoryClass(node.category)
    }));

    const edges = network.edges.map(edge => ({
      data: {
        id: edge.id,
        source: String(edge.source),
        target: String(edge.target),
        reaction: edge.reaction,
        equation: edge.equation,
        conditions: edge.conditions,
        sourceKey: edge.sourceKey,
        note: edge.note,
        cost: edge.cost
      }
    }));

    return [...nodes, ...edges];
  }, [network]);

  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;

    cyRef.current?.destroy();

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      wheelSensitivity: 0.2,
      minZoom: 0.08,
      maxZoom: 3.2,
      layout: (() => {
        if (layoutMode === "dagre") {
          return {
            name: "dagre",
            rankDir: "LR",
            nodeSep: 70,
            rankSep: 115,
            fit: true,
            padding: 70,
            animate: false
          };
        }
        const allKnown = elements.every(
          e => e.data.source || positionsRef.current.has(String(e.data.id))
        );
        return allKnown
          ? { name: "preset", fit: false, padding: 70 }
          : // Without saved positions every node starts at the origin, and a
            // non-randomised fcose run collapses them onto one diagonal line.
            {
              name: "fcose",
              quality: "default",
              randomize: true,
              animate: false,
              fit: true,
              padding: 80,
              nodeRepulsion: 8500,
              idealEdgeLength: 115,
              nodeSeparation: 65,
              gravity: 0.18,
              numIter: 900
            };
      })(),
      style: cytoscapeStyle(theme)
    });

    cyRef.current = cy;
    cy.on("tap", "node", event => {
      setInspected(event.target.data());
      setInspectedEdge(null);
    });
    cy.on("tap", "edge", event => {
      setInspectedEdge(event.target.data());
      setInspected(null);
    });
    const capturePositions = () =>
      cy.nodes().forEach(node => positionsRef.current.set(node.id(), { ...node.position() }));
    cy.one("layoutstop", () => {
      capturePositions();
      if (viewportRef.current && layoutMode !== "dagre") {
        cy.zoom(viewportRef.current.zoom);
        cy.pan(viewportRef.current.pan);
      }
    });
    // Initial nonanimated layouts can finish before layoutstop is attached.
    capturePositions();
    return () => {
      viewportRef.current = { zoom: cy.zoom(), pan: { ...cy.pan() } };
      cy.destroy();
    };
  }, [elements, layoutMode, theme]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const finalNodes = new Set(highlightedNodeIds.map(String));
    const finalEdges = new Set(highlightedEdgeIds);
    const visited = new Set(visitedNodeIds.map(String));

    cy.elements().removeClass(
      "highlighted dimmed selected visited active simulation-dim active-edge faded"
    );
    const activeEdges = new Set(activeEdgeIds.map(String));

    if (simulationRunning) {
      cy.nodes().addClass("simulation-dim");
      visited.forEach(id => {
        cy.getElementById(id).removeClass("simulation-dim").addClass("visited");
      });

      if (activeNodeId !== null && activeNodeId !== undefined) {
        cy.getElementById(String(activeNodeId))
          .removeClass("simulation-dim visited")
          .addClass("active");
      }
      // A finished trace can pass its final route; show it over the replay.
      if (finalEdges.size > 0) cy.elements().addClass("faded");
      finalEdges.forEach(id => {
        const edge = cy.getElementById(id);
        edge.removeClass("faded").addClass("highlighted");
        edge.connectedNodes().removeClass("simulation-dim faded").addClass("highlighted");
      });
      activeEdges.forEach(id => {
        const edge = cy.getElementById(id);
        edge.addClass("active-edge");
        edge.connectedNodes().removeClass("simulation-dim");
      });
    } else if (finalNodes.size > 0 || finalEdges.size > 0) {
      cy.elements().addClass("dimmed");
      finalNodes.forEach(id => cy.getElementById(id).removeClass("dimmed").addClass("highlighted"));
      finalEdges.forEach(id => cy.getElementById(id).removeClass("dimmed").addClass("highlighted"));
    }

    if (selectedNodeId !== null && selectedNodeId !== undefined) {
      cy.getElementById(String(selectedNodeId)).addClass("selected");
    }
  }, [
    highlightedNodeIds,
    highlightedEdgeIds,
    selectedNodeId,
    visitedNodeIds,
    activeNodeId,
    activeEdgeIds,
    simulationRunning
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || activeNodeId === null || activeNodeId === undefined) return;

    const node = cy.getElementById(String(activeNodeId));
    if (!node || node.empty()) return;

    cy.stop();
    cy.animate(
      {
        center: { eles: node },
        zoom: Math.max(0.95, Math.min(1.28, cy.zoom() < 0.95 ? 1.08 : cy.zoom()))
      },
      { duration: 150 }
    );
  }, [activeNodeId]);

  // Frame a finished trace route so its reactions are readable.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !simulationRunning || highlightedEdgeIds.length === 0) return;
    const nodes = highlightedEdgeIds.reduce(
      (acc, id) => acc.union(cy.getElementById(id).connectedNodes()),
      cy.collection()
    );
    if (!nodes.empty()) {
      cy.stop();
      cy.animate({ fit: { eles: nodes, padding: 90 } }, { duration: 450 });
    }
  }, [highlightedEdgeIds, simulationRunning]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || simulationRunning || highlightedNodeIds.length === 0) return;

    const collection = highlightedNodeIds.reduce(
      (acc, id) => acc.union(cy.getElementById(String(id))),
      cy.collection()
    );

    if (!collection.empty()) {
      window.setTimeout(() => {
        cy.animate({ fit: { eles: collection, padding: 130 } }, { duration: 700 });
      }, 80);
    }
  }, [highlightedNodeIds, simulationRunning]);

  const relayout = mode => {
    positionsRef.current.clear();
    viewportRef.current = null;
    setLayoutMode(mode);
  };
  const detail = inspectedEdge
    ? {
        caption: `Reaction · weight ${inspectedEdge.cost}`,
        title: inspectedEdge.reaction,
        lines: [
          inspectedEdge.equation || "Directed graph relationship",
          inspectedEdge.conditions || "See source metadata"
        ],
        close: () => setInspectedEdge(null),
        label: "Close reaction inspector"
      }
    : inspected
      ? {
          caption: "Compound",
          title: inspected.label || inspected.name,
          lines: [`${inspected.name} · ${inspected.category}`],
          close: () => setInspected(null),
          label: "Close inspector"
        }
      : null;
  return (
    <>
      <MapPanel className="network-graph-buttons top-3 right-3">
        <ButtonGroup aria-label="Graph layout controls">
          <Button
            size="sm"
            variant={layoutMode === "fcose" ? "secondary" : "ghost"}
            aria-pressed={layoutMode === "fcose"}
            onClick={() => relayout("fcose")}
          >
            Clustered
          </Button>
          <Button
            size="sm"
            variant={layoutMode === "dagre" ? "secondary" : "ghost"}
            aria-pressed={layoutMode === "dagre"}
            onClick={() => relayout("dagre")}
          >
            Directed
          </Button>
        </ButtonGroup>
      </MapPanel>
      <div className="network-canvas size-full bg-canvas" ref={containerRef} />
      {detail && (
        <Card
          size="sm"
          className="graph-node-inspector absolute bottom-3 left-3 z-20 w-[min(300px,calc(100%-1.5rem))] gap-1 shadow-lg"
        >
          <CardHeader>
            <CardDescription>{detail.caption}</CardDescription>
            <CardTitle className="break-words">{detail.title}</CardTitle>
            <CardAction>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={detail.label}
                onClick={detail.close}
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {detail.lines.map((line, index) => (
              <p key={index} className="break-words">
                {line}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
