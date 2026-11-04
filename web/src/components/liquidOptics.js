/**
 * ChemPath's browser-side, shape-aware glass displacement map.
 *
 * Unlike a noise filter, an SDF bends the backdrop only at a lens's rim.
 * R/G encode X/Y displacement and B stores the highlight amount.
 * No chemistry or Sigma canvas data is touched by this module.
 */
export const REFRACTION_SCALE=30;

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function distance(x,y,width,height,radius) {
  const halfX=width/2,halfY=height/2;
  const r=clamp(radius,0,Math.min(halfX,halfY));
  const qx=Math.abs(x-halfX)-(halfX-r),qy=Math.abs(y-halfY)-(halfY-r);
  return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
}

/**
 * Generate RGBA without reliance on DOM, so calculations can be unit-tested.
 * Neutral displacement (127.5) is used in the center and outside the shape.
 * Only generate on mount / resize: never in the pointermove event handler.
 */
export function createGlassDisplacement(width,height,{radius=14,bezel=17,depth=13}={}){
  const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
  const bytes=new Uint8ClampedArray(w*h*4);
  const f=clamp(bezel,2,Math.min(w,h)/2);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const d=distance(x+.5,y+.5,w,h,radius);
      const idx=(y*w+x)*4;
      const inside=-d;
      let px=0,py=0,light=0;
      if(inside>=0&&inside<f){
        const nX=(distance(x+1.5,y+.5,w,h,radius)-
          distance(x-.5,y+.5,w,h,radius))/2;
        const nY=(distance(x+.5,y+1.5,w,h,radius)-
          distance(x+.5,y-.5,w,h,radius))/2;
        const norm=Math.hypot(nX,nY)||1;
        const t=1-inside/f;
        const falloff=t*t*(3-2*t);
        px=-(nX/norm)*depth*falloff;
        py=-(nY/norm)*depth*falloff;
        light=falloff;
      }
      bytes[idx]=clamp(Math.round(127.5+px*255/REFRACTION_SCALE),0,255);
      bytes[idx+1]=clamp(Math.round(127.5+py*255/REFRACTION_SCALE),0,255);
      bytes[idx+2]=Math.round(light*255);
      bytes[idx+3]=255;
    }
  }
  return {width:w,height:h,data:bytes};
}

export function glassMapDataUrl(image,canvas){
  canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:false});
  if(!ctx)return null;
  ctx.putImageData(new ImageData(image.data,image.width,image.height),0,0);
  return canvas.toDataURL("image/png");
}
