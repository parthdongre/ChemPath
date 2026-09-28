import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef } from "react";

const categoryClass = (category = "") =>
  `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default function NetworkGraph({
  network,
  highlightedNodeIds = [],
  highlightedEdgeIds = [],
  selectedNodeId = null,
  visitedNodeIds = [],
  activeNodeId = null,
  simulationRunning = false
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const elements = useMemo(() => {
    if (!network) return [];

    const nodes = network.nodes.map((node) => ({
      data: {
        id: String(node.id),
        label: node.formula || node.name,
        fullLabel: `${node.formula || "?"}\n${node.name}`,
        name: node.name,
        formula: node.formula,
        category: node.category
      },
      classes: categoryClass(node.category)
    }));

    const edges = network.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: String(edge.source),
        target: String(edge.target),
        reaction: edge.reaction,
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
      layout: {
        name: "cose",
        animate: false,
        fit: true,
        padding: 110,
        randomize: true,
        nodeRepulsion: network.nodes.length > 180 ? 180000 : 280000,
        idealEdgeLength: network.nodes.length > 180 ? 105 : 125,
        edgeElasticity: 70,
        nestingFactor: 0.9,
        gravity: network.nodes.length > 180 ? 0.22 : 0.16,
        numIter: network.nodes.length > 180 ? 520 : 900,
        initialTemp: 140,
        coolingFactor: 0.95,
        minTemp: 1
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#171717",
            "border-color": "#55524c",
            "border-width": 1.4,
            label: "data(label)",
            color: "#d8d0c4",
            "font-size": 11,
            "font-weight": 700,
            "font-family": "JetBrains Mono, monospace",
            width: 58,
            height: 58,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#0a0a0a",
            "text-outline-width": 2,
            "min-zoomed-font-size": 8
          }
        },
        {
          selector: "node.category-organic",
          style: { "background-color": "#14211f", "border-color": "#69caba" }
        },
        {
          selector: "node.category-acid",
          style: { "background-color": "#211715", "border-color": "#c38478" }
        },
        {
          selector: "node.category-ion",
          style: { "background-color": "#201e16", "border-color": "#a59a79" }
        },
        {
          selector: "node.category-biochemical",
          style: { "background-color": "#172019", "border-color": "#8cb897" }
        },
        {
          selector: "node.category-salt",
          style: { "background-color": "#181b20", "border-color": "#8490a0" }
        },
        {
          selector: "node.category-base",
          style: { "background-color": "#181c21", "border-color": "#7da1b3" }
        },
        {
          selector: "edge",
          style: {
            width: 1.25,
            "line-color": "#363430",
            "target-arrow-color": "#57534c",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.85,
            "curve-style": "bezier",
            opacity: 0.58
          }
        },
        {
          selector: ".simulation-dim",
          style: { opacity: 0.11 }
        },
        {
          selector: "node.visited",
          style: {
            opacity: 0.94,
            "background-color": "#112824",
            "border-color": "#348b80",
            "border-width": 2,
            color: "#d8fff9"
          }
        },
        {
          selector: "node.active",
          style: {
            opacity: 1,
            width: 96,
            height: 96,
            label: "data(fullLabel)",
            "font-size": 11,
            "text-wrap": "wrap",
            "text-max-width": 84,
            "background-color": "#173f39",
            "border-color": "#5eead4",
            "border-width": 4,
            color: "#f5efe6",
            "z-index": 30
          }
        },
        {
          selector: ".dimmed",
          style: { opacity: 0.07 }
        },
        {
          selector: "node.highlighted",
          style: {
            opacity: 1,
            width: 76,
            height: 76,
            label: "data(fullLabel)",
            "font-size": 10,
            "text-wrap": "wrap",
            "text-max-width": 66,
            "background-color": "#163632",
            "border-color": "#5eead4",
            "border-width": 3.2,
            color: "#f5efe6",
            "z-index": 25
          }
        },
        {
          selector: "edge.highlighted",
          style: {
            opacity: 1,
            width: 4.2,
            "line-color": "#5eead4",
            "target-arrow-color": "#5eead4",
            "arrow-scale": 1.35,
            label: "data(reaction)",
            color: "#f5efe6",
            "font-family": "JetBrains Mono, monospace",
            "font-size": 11,
            "font-weight": 600,
            "text-background-color": "#0a0a0a",
            "text-background-opacity": 0.92,
            "text-background-padding": 5,
            "text-border-color": "#2e766e",
            "text-border-width": 1,
            "text-border-opacity": 0.7,
            "text-rotation": "autorotate",
            "z-index": 25
          }
        },
        {
          selector: ".selected",
          style: {
            "border-width": 3,
            "border-color": "#f5efe6"
          }
        }
      ]
    });

    cyRef.current = cy;
    return () => cy.destroy();
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const finalNodes = new Set(highlightedNodeIds.map(String));
    const finalEdges = new Set(highlightedEdgeIds);
    const visited = new Set(visitedNodeIds.map(String));

    cy.elements().removeClass(
      "highlighted dimmed selected visited active simulation-dim"
    );

    if (simulationRunning) {
      cy.nodes().addClass("simulation-dim");
      visited.forEach((id) => {
        cy.getElementById(id).removeClass("simulation-dim").addClass("visited");
      });

      if (activeNodeId !== null && activeNodeId !== undefined) {
        cy.getElementById(String(activeNodeId))
          .removeClass("simulation-dim visited")
          .addClass("active");
      }
    } else if (finalNodes.size > 0 || finalEdges.size > 0) {
      cy.elements().addClass("dimmed");
      finalNodes.forEach((id) =>
        cy.getElementById(id).removeClass("dimmed").addClass("highlighted")
      );
      finalEdges.forEach((id) =>
        cy.getElementById(id).removeClass("dimmed").addClass("highlighted")
      );
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || simulationRunning || highlightedNodeIds.length === 0) return;

    const collection = highlightedNodeIds.reduce(
      (acc, id) => acc.union(cy.getElementById(String(id))),
      cy.collection()
    );

    if (!collection.empty()) {
      window.setTimeout(() => {
        cy.animate(
          { fit: { eles: collection, padding: 130 } },
          { duration: 700 }
        );
      }, 80);
    }
  }, [highlightedNodeIds, simulationRunning]);

  return <div className="network-canvas" ref={containerRef} />;
}
