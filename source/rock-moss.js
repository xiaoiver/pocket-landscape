import {Matrix, Quaternion, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';
import {createMossTuft} from './moss-cushions.js';
import {plantedX} from './path-route.js';

const step=.014, radius=1.31, width=Math.ceil(2*radius/step)+1;
const clamp=x=>Math.max(0,Math.min(1,x));
const column=x=>Math.max(0,Math.min(width-1,Math.floor((x+radius)/step)));
const axes=[[1,0],[1,1],[0,1],[-1,1]];
export const isOutcrop=mesh=>/^(Woodland outcrop|Weathered granite)/.test(mesh.name);
export const originalTrail=(x,z)=>Math.abs(x-plantedX(z))<.14;

function noise(cell,seed) {
  let n=Math.imul(cell+seed*12347,2654435761);
  n=Math.imul(n^(n>>>16),2246822519);
  return ((n^(n>>>13))>>>0)/4294967296;
}

// Sample the upper envelope of the scanned triangles at reproducible, jittered
// points. Both the crevice test and the roots use this same physical surface.
function rockSurface(rocks) {
  const cells=new Map();
  for (const mesh of rocks) {
    const world=mesh.computeWorldMatrix(true);
    const {minimumWorld:lo,maximumWorld:hi}=mesh.getBoundingInfo().boundingBox;
    for (let j=column(lo.z-.09);j<=column(hi.z+.09);j++)
      for (let i=column(lo.x-.09);i<=column(hi.x+.09);i++) {
        const k=j*width+i;
        if (!cells.has(k)) cells.set(k,{
          x:(i+.14+.72*noise(k,1))*step-radius,z:(j+.14+.72*noise(k,2))*step-radius,
          top:-Infinity,nx:0,ny:1,nz:0,
        });
      }
    const xyz=mesh.getVerticesData(VertexBuffer.PositionKind), indices=mesh.getIndices(), points=[];
    for (let v=0;v<xyz.length;v+=3) points.push(Vector3.TransformCoordinates(Vector3.FromArray(xyz,v),world));
    for (let t=0;t<indices.length;t+=3) {
      const a=points[indices[t]], b=points[indices[t+1]], c=points[indices[t+2]];
      const bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z,det=bx*cz-bz*cx;
      if (Math.abs(det)<1e-9) continue;
      const by=b.y-a.y,cy=c.y-a.y;
      const nx=(cy*bz-by*cz)/det,nz=(by*cx-cy*bx)/det,len=Math.hypot(nx,1,nz);
      const right=column(Math.max(a.x,b.x,c.x)), bottom=column(Math.max(a.z,b.z,c.z));
      for (let j=column(Math.min(a.z,b.z,c.z));j<=bottom;j++)
        for (let i=column(Math.min(a.x,b.x,c.x));i<=right;i++) {
          const p=cells.get(j*width+i);
          const dx=p.x-a.x,dz=p.z-a.z,u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
          if (u<0 || v<0 || u+v>1) continue;
          const y=a.y+u*by+v*cy;
          if (y>p.top) {p.top=y;p.nx=nx/len;p.ny=1/len;p.nz=nz/len;}
        }
    }
  }
  return cells;
}

// A shallow, uneven pad under the folded shoots closes the spaces between
// rosettes in dense pockets. Both parts share one instanced draw.
function addVelvetBase(mesh) {
  const data=VertexData.ExtractFromMesh(mesh,true,true);
  const pos=data.positions=Array.from(data.positions), colors=data.colors=Array.from(data.colors);
  const indices=data.indices=Array.from(data.indices);
  const first=pos.length/3, lobes=11;
  for (let r=0;r<3;r++) {
    for (let i=0;i<lobes;i++) {
      const a=2*Math.PI*i/lobes, width=[.003,.010,.017][r]*(.65+.47*noise(i,9));
      pos.push(width*Math.cos(a),[.014,.010,-.002][r]+.003*noise(i,11),width*Math.sin(a));
      const v=(.77+.26*noise(i,12))*[1,.82,.53][r];
      colors.push(.062*v,.087*v,.024*v,1);
      const k=first+r*lobes+i,next=first+r*lobes+(i+1)%lobes;
      if (r) indices.push(k-lobes,next,k,next-lobes,next,k-lobes);
      else if (i>0 && i<lobes-1) indices.push(first,next,k);
    }
  }
  data.normals=[];
  VertexData.ComputeNormals(pos,indices,data.normals,{useRightHandedSystem:mesh.getScene().useRightHandedSystem});
  data.applyToMesh(mesh);
}

export function createRockMoss(scene,windowRay) {
  const mesh=createMossTuft(scene);
  mesh.name='Moss · sheltered rock feet';
  addVelvetBase(mesh);
  const towardWindow=windowRay.scale(-1), horizontal=Math.hypot(towardWindow.x,towardWindow.z);
  const offsets=[2,4,7,10].map(n=>({
    dx:Math.round(n*towardWindow.x/horizontal),dz:Math.round(n*towardWindow.z/horizontal),
    rise:n*step*towardWindow.y/horizontal,
  }));
  const at=new Vector3(),scale=new Vector3(),normal=new Vector3(),up=Vector3.Up();
  const tilt=new Quaternion(),spin=new Quaternion(),rotation=new Quaternion(),matrix=new Matrix();
  function rebuild(rocks,heightAt,exclude) {
    const cells=rockSurface(rocks), matrices=[],colors=[];
    function relief(k,dx,dz,y) {
      const col=k%width+dx;
      if (col<0 || col>=width) return -Infinity;
      const other=cells.get(k+dx+dz*width);
      return other ? other.top-y : -Infinity;
    }
    for (const [k,p] of cells) {
      const {x,z}=p;
      if (x*x+z*z>radius*radius || exclude?.(x,z)) continue;
      const ground=heightAt(x,z),height=Math.max(0,p.top-ground),y=ground+height;
      if (height>.21) continue;
      // Opposing raised lips describe a real cleft, including folds of a single
      // scan. A lone ridge shelters its foot only where it blocks the window.
      let nearest=0,cleft=0;
      for (const [dx,dz] of axes) {
        for (const distance of [2,4]) {
          const a=relief(k,dx*distance,dz*distance,y), b=relief(k,-dx*distance,-dz*distance,y);
          nearest=Math.max(nearest,clamp(Math.max(a,b)/.04)*(distance===2 ? 1 : .74));
          cleft=Math.max(cleft,clamp((Math.min(a,b)-.005)/.047));
        }
      }
      if (!height && !nearest) continue;
      let shade=0;
      for (const {dx,dz,rise} of offsets)
        shade=Math.max(shade,clamp((relief(k,dx,dz,y)-rise+.007)/.045));
      if (height) shade=Math.max(shade,clamp((p.nx*windowRay.x+p.nz*windowRay.z)/horizontal)*.87);
      const foot=clamp(1-height/(.075+.067*shade+.065*cleft));
      const patch=.65+.23*Math.sin(31*x+3*Math.sin(17*z))+.12*Math.cos(47*z+16*x);
      const density=(height ? 1 : nearest)*foot*patch*(.10+1.13*shade+1.12*cleft);
      if (noise(k,3)>density || density<.07) continue;
      normal.set(height ? p.nx : 0,height ? p.ny : 1,height ? p.nz : 0);
      const size=.37+.40*noise(k,4)+.50*clamp(density);
      scale.set(size,size*(.46+.28*cleft),size);
      Quaternion.FromUnitVectorsToRef(up,normal,tilt);
      Quaternion.RotationAxisToRef(up,noise(k,5)*Math.PI*2,spin);
      tilt.multiplyToRef(spin,rotation);
      at.set(x,y,z).addInPlaceFromFloats(.0015*normal.x,.0015*normal.y,.0015*normal.z);
      Matrix.ComposeToRef(scale,rotation,at,matrix);
      matrices.push(...matrix.m);
      const tint=.82+.24*noise(k,6)-.17*cleft;
      colors.push(tint*(.84+.20*(1-shade)),.90*tint,.74*tint,1);
    }
    mesh.setEnabled(matrices.length>0);
    if (matrices.length) {
      mesh.thinInstanceSetBuffer('matrix',Float32Array.from(matrices),16,true);
      mesh.thinInstanceSetBuffer('color',Float32Array.from(colors),4,true);
    }
  }
  return {mesh,rebuild};
}
