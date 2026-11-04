import {useEffect,useRef} from "react";

const SIZE=180;
const RADIUS=SIZE/2;
const MAGNIFICATION=1.72;

/**
 * ChemPath's *live* optical map lens. Unlike a CSS blur, it actually enlarges
 * the graph directly underneath the pointer, drawing the same Graphology
 * coordinates using Sigma's viewport projection.
 *
 * We do not attempt to imitate Apple's private native Liquid Glass renderer.
 * The loop is pointer-driven and stops entirely when the lens is off.
 */
export default function GraphLens({
  enabled,containerRef,rendererRef,graph,cartography,
  highlightedEdgeIds=[],selectedNodeId=null
}) {
  const shell=useRef(null);
  const canvasRef=useRef(null);

  useEffect(()=>{
    const container=containerRef.current;
    const shellElement=shell.current;
    const canvas=canvasRef.current;
    if(!enabled||!container||!shellElement||!canvas)return undefined;

    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)return undefined;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=SIZE*dpr;canvas.height=SIZE*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const highlighted=new Set(highlightedEdgeIds.map(String));
    const selected=selectedNodeId==null?null:String(selectedNodeId);
    let position={x:0,y:0};
    let frame=0;
    const points=new Map();

    const draw=()=>{
      frame=0;
      const renderer=rendererRef.current;
      if(!renderer)return;
      const cx=position.x,cy=position.y;
      points.clear();
      for(const key of graph.nodes()){
        const attrs=graph.getNodeAttributes(key);
        points.set(key,renderer.graphToViewport({x:attrs.x,y:attrs.y}));
      }
      const lensPoint=(p)=>({
        x:RADIUS+(p.x-cx)*MAGNIFICATION,
        y:RADIUS+(p.y-cy)*MAGNIFICATION
      });
      ctx.save();
      ctx.clearRect(0,0,SIZE,SIZE);
      ctx.beginPath();ctx.arc(RADIUS,RADIUS,RADIUS,0,Math.PI*2);ctx.clip();
      ctx.fillStyle="#13222f";ctx.fillRect(0,0,SIZE,SIZE);
      // Draw ranked local relationships only: a lens reveals detail, not noise.
      let drawn=0;
      for(const edge of cartography.entries){
        if(drawn>=480)break;
        const a=points.get(edge.source),b=points.get(edge.target);
        if(!a||!b)continue;
        const p=lensPoint(a),q=lensPoint(b);
        if(Math.max(p.x,q.x)<-8||Math.min(p.x,q.x)>SIZE+8||
          Math.max(p.y,q.y)<-8||Math.min(p.y,q.y)>SIZE+8)continue;
        const route=highlighted.has(edge.id);
        ctx.strokeStyle=route?"#6de9d2":
          cartography.overview.has(edge.id)?"#687f8c":"#3b5361";
        ctx.lineWidth=route?2.35:cartography.overview.has(edge.id)?1.25:.62;
        ctx.globalAlpha=route?1:cartography.overview.has(edge.id)?.66:.38;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
        drawn++;
      }
      ctx.globalAlpha=1;
      let labels=0;
      for(const [key,v] of points){
        const p=lensPoint(v);
        if(p.x<7||p.x>SIZE-7||p.y<7||p.y>SIZE-7)continue;
        const rank=cartography.priority.get(key)??Infinity;
        const isSelected=selected===key;
        const routeNode=highlightedEdgeIds.length>0&&rank<8;
        const attrs=graph.getNodeAttributes(key);
        ctx.fillStyle=isSelected?"#f0c888":rank<45?"#a2c5cf":"#7795a2";
        const radius=isSelected?5:rank<20?3.3:2.25;
        ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
        if(labels<9&&(isSelected||rank<21||routeNode)){
          ctx.font="600 10px -apple-system,BlinkMacSystemFont,Inter,sans-serif";
          ctx.textAlign="left";ctx.textBaseline="middle";
          ctx.fillStyle="#e6f4f5";
          ctx.fillText(String(attrs.formula||attrs.name||key).slice(0,24),
            Math.min(SIZE-49,p.x+8),p.y-9,95);
          labels++;
        }
      }
      ctx.restore();
      // Rim lighting is handled by CSS, keeping text and underlying graph crisp.
    };

    const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(draw);};
    const onMove=event=>{
      const bounds=container.getBoundingClientRect();
      position={x:event.clientX-bounds.left,y:event.clientY-bounds.top};
      shellElement.style.transform=
        "translate3d("+(position.x-RADIUS)+"px,"+(position.y-RADIUS)+"px,0)";
      shellElement.style.opacity="1";
      schedule();
    };
    const onLeave=()=>{shellElement.style.opacity="0";};
    const onWheel=()=>{shellElement.style.opacity="0";};
    container.addEventListener("pointermove",onMove,{passive:true});
    container.addEventListener("pointerleave",onLeave);
    container.addEventListener("wheel",onWheel,{passive:true});
    return ()=>{
      if(frame)window.cancelAnimationFrame(frame);
      container.removeEventListener("pointermove",onMove);
      container.removeEventListener("pointerleave",onLeave);
      container.removeEventListener("wheel",onWheel);
      shellElement.style.opacity="0";
    };
  },[enabled,containerRef,rendererRef,graph,cartography,highlightedEdgeIds,selectedNodeId]);

  if(!enabled)return null;
  return <div className="sigma-live-lens studio-liquid-glass" ref={shell}
    aria-hidden="true" data-testid="graph-focus-lens">
    <canvas ref={canvasRef} width={SIZE} height={SIZE}/>
    <span className="sigma-lens-rim"/>
  </div>;
}
