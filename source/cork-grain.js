// Periodic value noise keeps the grain continuous around the side of the stopper.
import {DynamicTexture, Texture} from '@babylonjs/core';

export function createCorkGrain(scene) {
  const size=256;
  let seed=307;
  function noise(columns,rows) {
    const grid=Float32Array.from({length:columns*rows},()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    });
    return (x,y)=>{
      const u=x*columns/size,v=y*rows/size;
      const i=Math.floor(u),j=Math.floor(v);
      const index=(a,b)=>grid[(b & (rows-1))*columns+(a & (columns-1))];
      const t=u-i,s=v-j;
      const tx=t*t*(3-2*t),ty=s*s*(3-2*s);
      const top=index(i,j)*(1-tx)+index(i+1,j)*tx;
      const bottom=index(i,j+1)*(1-tx)+index(i+1,j+1)*tx;
      return top*(1-ty)+bottom*ty;
    };
  }
  const flakes=noise(32,32),pores=noise(32,128),specks=noise(128,128),mottle=noise(8,8);
  function surface(name) {
    const tex=new DynamicTexture(name,size,scene,true,Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU=tex.wrapV=Texture.WRAP_ADDRESSMODE;
    const ctx=tex.getContext();
    return {tex,ctx,pixels:ctx.createImageData(size,size)};
  }
  const color=surface('Cork cut grain'),normal=surface('Cork pore relief');
  const heights=new Float32Array(size*size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const broad=mottle(x,y)-.5,grain=flakes(x+9*broad,y)-.5;
    const grit=specks(x,y)-.5;
    const pit=Math.max(0,(pores(x+8*grain,y+10*broad)-.70)*4);
    const tone=33*broad+46*grain+22*grit-72*pit;
    const i=y*size+x;
    heights[i]=.8*grain+.34*grit-1.65*pit;
    color.pixels.data.set([177+tone,132+.84*tone,89+.64*tone,255],4*i);
  }
  const at=(x,y)=>heights[(y & (size-1))*size+(x & (size-1))];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const nx=at(x-1,y)-at(x+1,y),ny=at(x,y+1)-at(x,y-1);
    const scale=127/Math.hypot(nx,ny,1);
    normal.pixels.data.set([128+nx*scale,128+ny*scale,128+scale,255],4*(y*size+x));
  }
  normal.tex.gammaSpace=false;
  for (const layer of [color,normal]) {
    layer.ctx.putImageData(layer.pixels,0,0);
    layer.tex.update();
  }
  return {color:color.tex,normal:normal.tex};
}
