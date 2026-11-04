import {useEffect,useRef} from "react";
import {spreadClusterMarkers} from "./graphClusters.js";

/**
 * Camera-locked cluster markers like labeled map neighborhoods.
 * The graph remains intact; activating a marker only changes the camera.
 */
export default function ClusterOverlay({clusters,rendererRef}){
  const layer=useRef(null);
  useEffect(()=>{
    const root=layer.current;
    if(!root||!clusters.length)return undefined;
    let camera=null,frame=0,disposed=false;
    const byId=new Map([...root.querySelectorAll("[data-cluster-id]")].map(
      element=>[element.dataset.clusterId,element]
    ));
    const draw=()=>{
      frame=0;
      const renderer=rendererRef.current;
      if(!renderer||disposed)return;
      const {width,height}=renderer.getDimensions();
      const project=clusters.map(cluster=>{
        const point=renderer.graphToViewport({x:cluster.x,y:cluster.y});
        return {...cluster,anchorX:point.x,anchorY:point.y,x:point.x,y:point.y};
      });
      const placed=spreadClusterMarkers(project,width,height);
      for(const cluster of placed){
        const element=byId.get(cluster.id);
        if(!element)continue;
        const visible=cluster.anchorX>12&&cluster.anchorY>12&&
          cluster.anchorX<width-12&&cluster.anchorY<height-12;
        element.style.transform="translate3d("+cluster.x+"px,"+cluster.y+"px,0) translate(-50%,-50%)";
        element.style.opacity=visible?"1":"0";
        element.style.pointerEvents=visible?"auto":"none";
      }
    };
    const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(draw);};
    const bind=()=>{
      if(disposed)return;
      const renderer=rendererRef.current;
      if(!renderer){frame=requestAnimationFrame(bind);return;}
      camera=renderer.getCamera();
      camera.on("updated",schedule);
      draw();
    };
    frame=requestAnimationFrame(bind);
    const resize=typeof ResizeObserver==="function"?new ResizeObserver(schedule):null;
    if(resize)resize.observe(root);
    return ()=>{
      disposed=true;
      if(frame)cancelAnimationFrame(frame);
      camera?.removeListener("updated",schedule);
      resize?.disconnect();
    };
  },[clusters,rendererRef]);
  if(!clusters.length)return null;
  const focus=cluster=>{
    const renderer=rendererRef.current;
    if(!renderer)return;
    const bbox=renderer.getBBox();
    const span=Math.max(bbox.x[1]-bbox.x[0],bbox.y[1]-bbox.y[0],1e-6);
    const centerX=(bbox.x[0]+bbox.x[1])/2;
    const centerY=(bbox.y[0]+bbox.y[1])/2;
    const next={
      x:.5+(cluster.x-centerX)/span,
      y:.5+(cluster.y-centerY)/span,
      ratio:.36
    };
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      renderer.getCamera().setState(next);
    else renderer.getCamera().animate(next,{duration:320});
  };
  return <div ref={layer} className="sigma-cluster-layer" aria-label="Compound groups">
    {clusters.map(cluster=><button key={cluster.id} type="button"
      data-cluster-id={cluster.id} className="sigma-compound-cluster"
      title={"Zoom to "+cluster.count+" visible compounds; most common category: "+cluster.category}
      aria-label={"Zoom to group of "+cluster.count+" compounds"}
      onClick={()=>focus(cluster)}>
      <span className="sigma-cluster-count">{cluster.count}</span>
      <span className="sigma-cluster-type">{cluster.category}</span>
    </button>)}
  </div>;
}
