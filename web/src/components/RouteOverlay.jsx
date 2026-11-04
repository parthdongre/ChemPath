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
    const originTag=svg.querySelector(".sigma-route-origin-label");
    const destinationTag=svg.querySelector(".sigma-route-destination-label");
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
      const annotate=(element,point,key,prefix)=>{
        if(!element||!graph.hasNode(String(key)))return;
        const compound=graph.getNodeAttributes(String(key));
        const label=String(compound.formula||compound.name||key).slice(0,24);
        const text=element.querySelector("text");
        const box=element.querySelector("rect");
        const width=Math.max(51,label.length*7+22);
        const parentWidth=svg.parentElement?.clientWidth||900;
        const x=Math.max(6,Math.min(parentWidth-width-6,point.x-width/2));
        const y=Math.max(31,point.y-33);
        element.setAttribute("transform","translate("+x+","+y+")");
        if(text)text.textContent=label;
        if(box)box.setAttribute("width",String(width));
      };
      annotate(originTag,points[0],routeNodes[0],"start");
      annotate(destinationTag,points[points.length-1],routeNodes[routeNodes.length-1],"target");
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
    <g className="sigma-route-origin-label">
      <rect x="0" y="0" height="24" rx="8"/>
      <text x="11" y="15.5"/>
    </g>
    <g className="sigma-route-destination-label">
      <rect x="0" y="0" height="24" rx="8"/>
      <text x="11" y="15.5"/>
    </g>
  </svg>;
}
