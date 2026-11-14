import { useEffect, useMemo, useRef } from "react";

/**
 * A map-style directional route overlay: a dark casing under a clean path
 * line, source/target markers, a reaction label on every leg and continuous
 * viewport synchronization.
 *
 * Only graph node/edge identifiers passed from the verified C++ path result
 * are used. This does not interpolate or invent intermediate reactions.
 */
const LABEL_FONT = "600 12.5px 'Geist Variable',-apple-system,sans-serif";
const MAX_LABEL = 34;
let measureContext = null;
function textWidth(text) {
  if (typeof document === "undefined") return text.length * 7;
  measureContext ??= document.createElement("canvas").getContext("2d");
  measureContext.font = LABEL_FONT;
  return measureContext.measureText(text).width;
}

export default function RouteOverlay({ graph, rendererRef, routeNodes = [], routeEdges = [] }) {
  const svgRef = useRef(null);
  // One chip per leg, named after the reaction stored on the graph edge.
  const legs = useMemo(
    () =>
      routeEdges.map((key, index) => {
        const name = graph.hasEdge(String(key))
          ? graph.getEdgeAttribute(String(key), "reaction")
          : "";
        const label = String(name || "Reaction");
        const short = label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1) + "…" : label;
        return { key: String(key), index, label, short, width: Math.ceil(textWidth(short)) + 20 };
      }),
    [graph, routeEdges]
  );

  useEffect(() => {
    if (routeNodes.length < 2 || routeEdges.length < 1) return undefined;
    const svg = svgRef.current;
    if (!svg) return undefined;
    const first = svg.querySelector(".sigma-route-start");
    const last = svg.querySelector(".sigma-route-end");
    const paths = [...svg.querySelectorAll("path.sigma-route-casing,path.sigma-route-path")];
    const chips = [...svg.querySelectorAll("[data-leg]")];
    let frame = 0,
      disposed = false,
      camera = null;
    const draw = () => {
      frame = 0;
      const renderer = rendererRef.current;
      if (!renderer || disposed) return;
      const points = routeNodes
        .map(String)
        .filter(key => graph.hasNode(key))
        .map(key => {
          const { x, y } = graph.getNodeAttributes(key);
          return renderer.graphToViewport({ x, y });
        });
      if (points.length < 2) {
        svg.style.opacity = "0";
        return;
      }
      const d = points
        .map((p, index) => (index ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2))
        .join(" ");
      for (const path of paths) path.setAttribute("d", d);
      const root = svg.parentElement;
      const width = root?.clientWidth || 900,
        height = root?.clientHeight || 600;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      first?.setAttribute("cx", String(points[0].x));
      first?.setAttribute("cy", String(points[0].y));
      last?.setAttribute("cx", String(points[points.length - 1].x));
      last?.setAttribute("cy", String(points[points.length - 1].y));
      // Reaction chips sit on the middle of each leg, kept inside the canvas.
      for (const chip of chips) {
        const index = Number(chip.dataset.leg);
        const a = points[index],
          b = points[index + 1];
        if (!a || !b) {
          chip.style.display = "none";
          continue;
        }
        const w = Number(chip.dataset.width);
        const x = Math.max(6, Math.min(width - w - 6, (a.x + b.x) / 2 - w / 2));
        const y = Math.max(6, Math.min(height - 34, (a.y + b.y) / 2 - 13));
        chip.style.display = "";
        chip.setAttribute("transform", "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
      }
      svg.style.opacity = "1";
    };
    const schedule = () => {
      if (!frame && !disposed) frame = window.requestAnimationFrame(draw);
    };
    const bind = () => {
      if (disposed) return;
      const renderer = rendererRef.current;
      if (!renderer) {
        frame = window.requestAnimationFrame(bind);
        return;
      }
      camera = renderer.getCamera();
      camera.on("updated", schedule);
      draw();
    };
    frame = window.requestAnimationFrame(bind);
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (resize && svg.parentElement) resize.observe(svg.parentElement);
    window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      camera?.removeListener("updated", schedule);
      resize?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [graph, rendererRef, routeNodes, routeEdges, legs]);

  if (routeNodes.length < 2 || !routeEdges.length) return null;
  return (
    <svg ref={svgRef} className="sigma-route-overlay" aria-hidden="true" preserveAspectRatio="none">
      <path className="sigma-route-casing" />
      <path className="sigma-route-path" />
      <circle className="sigma-route-start" r="7" />
      <circle className="sigma-route-end" r="8" />
      {legs.map(leg => (
        <g
          key={leg.key + "-" + leg.index}
          className="sigma-route-reaction"
          data-leg={leg.index}
          data-width={leg.width}
        >
          <title>{leg.label}</title>
          <rect x="0" y="0" width={leg.width} height="26" rx="13" />
          <text x="10" y="17.5">
            {leg.short}
          </text>
        </g>
      ))}
    </svg>
  );
}
