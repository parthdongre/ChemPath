import {useEffect} from "react";

/**
 * Adaptive material lighting for small navigation surfaces. Uses delegated
 * pointer events and CSS variables, not React setState on every mouse move.
 *
 * A conservative SVG displacement filter can add gentle refraction to a live
 * backdrop when the browser supports SVG references in backdrop-filter.
 * Other browsers keep the blurred/translucent material.
 */
export default function StudioGlassEffects() {
  useEffect(()=>{
    const root=document.querySelector(".studio-app");
    if(!root)return undefined;
    let frame=0,last=null;
    const render=()=>{
      frame=0;
      if(!last)return;
      const {target,x,y}=last;
      target.style.setProperty("--glass-pointer-x",x+"%");
      target.style.setProperty("--glass-pointer-y",y+"%");
    };
    const onPointer=event=>{
      if(event.pointerType==="touch")return;
      const target=event.target?.closest?.(".studio-liquid-glass");
      if(!target||!root.contains(target))return;
      const bounds=target.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const x=Math.max(0,Math.min(100,(event.clientX-bounds.left)*100/bounds.width));
      const y=Math.max(0,Math.min(100,(event.clientY-bounds.top)*100/bounds.height));
      last={target,x,y};
      if(!frame)frame=requestAnimationFrame(render);
    };
    const onLeave=()=>{
      if(last?.target){
        last.target.style.removeProperty("--glass-pointer-x");
        last.target.style.removeProperty("--glass-pointer-y");
      }
      last=null;
    };
    root.addEventListener("pointermove",onPointer,{passive:true});
    root.addEventListener("pointerleave",onLeave);
    return ()=>{
      root.removeEventListener("pointermove",onPointer);
      root.removeEventListener("pointerleave",onLeave);
      if(frame)cancelAnimationFrame(frame);
    };
  },[]);
  return <svg className="studio-glass-svg-filter" width="0" height="0"
      aria-hidden="true" focusable="false">
    <defs>
      <filter id="studio-optical-displacement" x="-10%" y="-10%" width="120%" height="120%"
        colorInterpolationFilters="sRGB">
        <feTurbulence baseFrequency="0.018" numOctaves="1" seed="4"
          type="fractalNoise" result="refractionMap"/>
        <feDisplacementMap in="SourceGraphic" in2="refractionMap" scale="2.8"
          xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>
  </svg>;
}
