import {useEffect,useRef} from "react";
import {createGlassDisplacement,glassMapDataUrl,REFRACTION_SCALE} from "./liquidOptics.js";

const SVG="http://www.w3.org/2000/svg";
const svgTag=(tag,attrs={})=>{
  const element=document.createElementNS(SVG,tag);
  for(const [name,value] of Object.entries(attrs))element.setAttribute(name,String(value));
  return element;
};

/**
 * This is a browser-native optical interpretation, not the SwiftUI API:
 * - shape-matched SDF bending of the live backdrop;
 * - slightly separated RGB samples at the rim;
 * - hover-responsive highlight and fallback glass material.
 *
 * The live CSS backdrop-filter SVG reference is Chromium-specific.
 * Other engines retain the readable frosted appearance.
 */
export default function StudioGlassEffects(){
  const definitions=useRef(null);
  useEffect(()=>{
    const root=document.querySelector(".studio-app"),defs=definitions.current;
    if(!root||!defs)return undefined;
    const entries=new Map(),canvas=document.createElement("canvas");
    let serial=0,raf=0,last=null;
    const supportsBackdropRefraction=Boolean(window.CSS?.supports?.(
      "backdrop-filter","url(#chempath-test)")||
      window.CSS?.supports?.("-webkit-backdrop-filter","url(#chempath-test)"));
    const preferences=()=>root.dataset.reduceTransparency==="true"||
      window.matchMedia?.("(prefers-reduced-transparency: reduce)")?.matches||
      window.matchMedia?.("(prefers-contrast: more)")?.matches;
    const invalidate=element=>{
      const entry=entries.get(element);
      if(!entry||!element.isConnected)return;
      const rect=element.getBoundingClientRect();
      const w=Math.round(rect.width),h=Math.round(rect.height);
      if(w<34||h<25||w>850||h>580)return;
      const radius=Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)||13;
      const signature=[w,h,Math.round(radius)].join(":");
      if(entry.signature===signature)return;
      entry.signature=signature;
      const optical=createGlassDisplacement(w,h,{
        radius,bezel:Math.min(20,Math.max(11,h*.28)),depth:12
      });
      const href=glassMapDataUrl(optical,canvas);
      if(!href)return;
      entry.map.setAttribute("href",href);
      entry.map.setAttribute("width",String(w));
      entry.map.setAttribute("height",String(h));
      entry.filter.setAttribute("x","0");
      entry.filter.setAttribute("y","0");
      entry.filter.setAttribute("width",String(w));
      entry.filter.setAttribute("height",String(h));
      entry.filter.setAttribute("filterUnits","userSpaceOnUse");
      entry.filter.setAttribute("primitiveUnits","userSpaceOnUse");
      element.dataset.liquidRefraction="displacement";
    };
    const attach=element=>{
      if(entries.has(element))return;
      const id="chempath-liquid-lens-"+(++serial);
      const filter=svgTag("filter",{id,"color-interpolation-filters":"sRGB"});
      const map=svgTag("feImage",{x:0,y:0,width:1,height:1,
        preserveAspectRatio:"none",result:"OPTICAL_MAP"});
      filter.append(map);
      for(const [channel,scale,matrix] of [
        ["RED",REFRACTION_SCALE*.95,"1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
        ["GREEN",REFRACTION_SCALE,"0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
        ["BLUE",REFRACTION_SCALE*1.05,"0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"]
      ]){
        filter.append(svgTag("feDisplacementMap",{
          in:"SourceGraphic",in2:"OPTICAL_MAP",scale:scale.toFixed(2),
          xChannelSelector:"R",yChannelSelector:"G",result:"BENT_"+channel
        }));
        filter.append(svgTag("feColorMatrix",{
          in:"BENT_"+channel,type:"matrix",values:matrix,result:channel
        }));
      }
      filter.append(svgTag("feBlend",{in:"RED",in2:"GREEN",mode:"screen",result:"RG"}));
      filter.append(svgTag("feBlend",{in:"RG",in2:"BLUE",mode:"screen"}));
      defs.append(filter);
      element.style.setProperty("--chempath-lens-filter",'url("#'+id+'")');
      element.dataset.liquidRefraction=supportsBackdropRefraction?"pending":"frosted";
      const observer=new ResizeObserver(()=>invalidate(element));
      observer.observe(element);
      entries.set(element,{filter,map,observer,signature:null});
      if(supportsBackdropRefraction)invalidate(element);
    };
    const scan=()=>{
      for(const element of root.querySelectorAll(".studio-liquid-glass")){
        if(!entries.has(element))attach(element);
      }
      for(const [element,entry] of entries){
        if(element.isConnected)continue;
        entry.observer.disconnect();entry.filter.remove();entries.delete(element);
      }
    };
    scan();
    const mutations=new MutationObserver(scan);
    mutations.observe(root,{subtree:true,childList:true});
    const onMove=event=>{
      if(event.pointerType==="touch"||preferences())return;
      const target=event.target?.closest?.(".studio-liquid-glass");
      if(!target||!root.contains(target))return;
      const bounds=target.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const x=Math.max(0,Math.min(100,100*(event.clientX-bounds.left)/bounds.width));
      const y=Math.max(0,Math.min(100,100*(event.clientY-bounds.top)/bounds.height));
      last={target,x,y};
      if(!raf)raf=requestAnimationFrame(()=>{
        raf=0;if(!last)return;
        last.target.style.setProperty("--glass-pointer-x",last.x+"%");
        last.target.style.setProperty("--glass-pointer-y",last.y+"%");
      });
    };
    const onLeave=()=>{
      if(last?.target){
        last.target.style.removeProperty("--glass-pointer-x");
        last.target.style.removeProperty("--glass-pointer-y");
      }
      last=null;
    };
    root.addEventListener("pointermove",onMove,{passive:true});
    root.addEventListener("pointerleave",onLeave);
    return ()=>{
      root.removeEventListener("pointermove",onMove);
      root.removeEventListener("pointerleave",onLeave);
      mutations.disconnect();
      if(raf)cancelAnimationFrame(raf);
      for(const entry of entries.values()){
        entry.observer.disconnect();entry.filter.remove();
      }
      entries.clear();
    };
  },[]);
  return <svg className="studio-glass-svg-filter" width="0" height="0"
    aria-hidden="true" focusable="false"><defs ref={definitions}/></svg>;
}
