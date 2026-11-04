import {useEffect,useRef} from "react";

/**
 * A map-style directional route overlay: a dark casing under a clean path
 * line, source/target markers and continuous viewport synchronization.
 *
 * Only graph node/edge identifiers passed from the verified C++ path result
 * are used. This does not interpolate or invent intermediate reactions.
 */
export default function RouteOverlay({graph,rendererRef,routeNodes=[],routeEdges=[]}) {
  const svgRef=useRef(null);
  useEffect(()=>{
    if(routeNodes.length<2||routeEdges.length<1)return undefined;
    const svg=svgRef.current;
    if(!svg)return undefined;
    const first=svg.querySelector(".sigma-route-start");
    const last=svg.querySelector(".sigma-route-end");
    const paths=[...svg.querySelectorAll("path")];
    let frame=0,disposed=false,camera=null;
    const draw=()=>{
      frame=0;
      const renderer=rendererRef.current;
      if(!renderer||disposed)return;
      const points=routeNodes.map(String)
        .filter(key=>graph.hasNode(key))
        .map(key=>{
          const {x,y}=graph.getNodeAttributes(key);
          return renderer.graphToViewport({x,y});
        });
      if(points.length<2){svg.style.opacity="0";return;}
      const d=points.map((p,index)=>
        (index?"L":"M")+p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" ");
      for(const path of paths)path.setAttribute("d",d);
      const root=svg.parentElement;
      if(root)svg.setAttribute("viewBox","0 0 "+root.clientWidth+" "+root.clientHeight);
      first?.setAttribute("cx",String(points[0].x));
      first?.setAttribute("cy",String(points[0].y));
      last?.setAttribute("cx",String(points[points.length-1].x));
      last?.setAttribute("cy",String(points[points.length-1].y));
      svg.style.opacity="1";
    };
    const schedule=()=>{
      if(!frame&&!disposed)frame=window.requestAnimationFrame(draw);
    };
    const bind=()=>{
      if(disposed)return;
      const renderer=rendererRef.current;
      if(!renderer){frame=window.requestAnimationFrame(bind);return;}
      camera=renderer.getCamera();
      camera.on("updated",schedule);
      draw();
    };
    frame=window.requestAnimationFrame(bind);
    const resize=typeof ResizeObserver==="function"?new ResizeObserver(schedule):null;
    if(resize&&svg.parentElement)resize.observe(svg.parentElement);
    window.addEventListener("resize",schedule);
    return ()=>{
      disposed=true;
      if(frame)cancelAnimationFrame(frame);
      camera?.removeListener("updated",schedule);
      resize?.disconnect();
      window.removeEventListener("resize",schedule);
    };
  },[graph,rendererRef,routeNodes,routeEdges]);

  if(routeNodes.length<2||!routeEdges.length)return null;
  return <svg ref={svgRef} className="sigma-route-overlay" aria-hidden="true"
    preserveAspectRatio="none">
    <path className="sigma-route-casing"/>
    <path className="sigma-route-path"/>
    <circle className="sigma-route-start" r="6.8"/>
    <circle className="sigma-route-end" r="7.9"/>
  </svg>;
}
