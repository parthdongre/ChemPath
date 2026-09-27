import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef } from "react";

const categoryClass = (category = "") =>
  `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default function NetworkGraph({
  network,
  highlightedNodeIds = [],
  highlightedEdgeIds = [],
  selectedNodeId = null
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const elements = useMemo(() => {
    if (!network) return [];

    const nodes = network.nodes.map((node) => ({
      data: {
        id: String(node.id),
        label: node.formula || node.name,
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
        reaction: edge.reaction
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
      wheelSensitivity: 0.22,
      minZoom: 0.34,
      maxZoom: 2.5,
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: 120000,
        idealEdgeLength: 104,
        edgeElasticity: 82,
        gravity: 0.5,
        numIter: 1000
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#171717",
            "border-color": "#55524c",
            "border-width": 1.2,
            label: "data(label)",
            color: "#c9c1b4",
            "font-size": 10,
            "font-weight": 700,
            "font-family": "JetBrains Mono, monospace",
            width: 44,
            height: 44,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#0a0a0a",
            "text-outline-width": 2
          }
        },
        {
          selector: "node.category-organic",
          style: {
            "background-color": "#14211f",
            "border-color": "#69caba"
          }
        },
        {
          selector: "node.category-acid",
          style: {
            "background-color": "#211715",
            "border-color": "#c38478"
          }
        },
        {
          selector: "node.category-ion",
          style: {
            "background-color": "#201e16",
            "border-color": "#a59a79"
          }
        },
        {
          selector: "node.category-biochemical",
          style: {
            "background-color": "#172019",
            "border-color": "#8cb897"
          }
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#3a3834",
            "target-arrow-color": "#5a5650",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.75,
            "curve-style": "bezier",
            opacity: 0.72
          }
        },
        {
          selector: ".dimmed",
          style: { opacity: 0.1 }
        },
        {
          selector: ".highlighted",
          style: {
            opacity: 1,
            "background-color": "#163632",
            "border-color": "#5eead4",
            "border-width": 2.4,
            color: "#f5efe6",
            "z-index": 20
          }
        },
        {
          selector: "edge.highlighted",
          style: {
            opacity: 1,
            width: 2.8,
            "line-color": "#5eead4",
            "target-arrow-color": "#5eead4",
            "z-index": 20
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

    const nodeSet = new Set(highlightedNodeIds.map(String));
    const edgeSet = new Set(highlightedEdgeIds);

    cy.elements().removeClass("highlighted dimmed selected");

    const hasHighlight = nodeSet.size > 0 || edgeSet.size > 0;
    if (hasHighlight) {
      cy.elements().addClass("dimmed");
      nodeSet.forEach((id) =>
        cy.getElementById(id).removeClass("dimmed").addClass("highlighted")
      );
      edgeSet.forEach((id) =>
        cy.getElementById(id).removeClass("dimmed").addClass("highlighted")
      );
    }

    if (selectedNodeId !== null && selectedNodeId !== undefined) {
      cy.getElementById(String(selectedNodeId)).addClass("selected");
    }
  }, [highlightedNodeIds, highlightedEdgeIds, selectedNodeId]);

  return <div className="network-canvas" ref={containerRef} />;
}
