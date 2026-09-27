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
      minZoom: 0.35,
      maxZoom: 2.6,
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: 110000,
        idealEdgeLength: 96,
        edgeElasticity: 85,
        gravity: 0.55,
        numIter: 900
      },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#15263d",
            "border-color": "#355272",
            "border-width": 1.5,
            label: "data(label)",
            color: "#dbeafe",
            "font-size": 11,
            "font-weight": 700,
            width: 46,
            height: 46,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#07111f",
            "text-outline-width": 2
          }
        },
        {
          selector: "node.category-organic",
          style: { "background-color": "#153e43", "border-color": "#22d3a7" }
        },
        {
          selector: "node.category-acid",
          style: { "background-color": "#43213a", "border-color": "#f472b6" }
        },
        {
          selector: "node.category-ion",
          style: { "background-color": "#342b55", "border-color": "#a78bfa" }
        },
        {
          selector: "node.category-biochemical",
          style: { "background-color": "#3d3617", "border-color": "#facc15" }
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": "#2f4660",
            "target-arrow-color": "#55718f",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.7
          }
        },
        { selector: ".dimmed", style: { opacity: 0.16 } },
        {
          selector: ".highlighted",
          style: {
            opacity: 1,
            "background-color": "#0f766e",
            "border-color": "#5eead4",
            "border-width": 3,
            "z-index": 999
          }
        },
        {
          selector: "edge.highlighted",
          style: {
            opacity: 1,
            width: 4,
            "line-color": "#2dd4bf",
            "target-arrow-color": "#2dd4bf",
            "z-index": 999
          }
        },
        {
          selector: ".selected",
          style: {
            "border-width": 4,
            "border-color": "#e2e8f0"
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
      nodeSet.forEach((id) => cy.getElementById(id).removeClass("dimmed").addClass("highlighted"));
      edgeSet.forEach((id) => cy.getElementById(id).removeClass("dimmed").addClass("highlighted"));
    }

    if (selectedNodeId !== null && selectedNodeId !== undefined) {
      cy.getElementById(String(selectedNodeId)).addClass("selected");
    }
  }, [highlightedNodeIds, highlightedEdgeIds, selectedNodeId]);

  return <div className="network-canvas" ref={containerRef} />;
}
