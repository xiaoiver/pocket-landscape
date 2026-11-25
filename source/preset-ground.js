import {Vector3, VertexBuffer} from '@babylonjs/core';
import {soilHeight} from './substrate.js';

// Sample the top of the authored soil and moss once. The brush and plant tools
// then share a height query without raycasting thousands of times per moss patch.
export function samplePresetGround(meshes) {
  const size = 113, radius = 1.34, scale = (size-1)/(2*radius);
  const heights = new Float32Array(size*size).fill(-Infinity);
  for (const mesh of meshes) {
    const coords = mesh.getVerticesData(VertexBuffer.PositionKind);
    const indices = mesh.getIndices(), matrix = mesh.computeWorldMatrix(true);
    const points = [];
    for (let i=0; i<coords.length; i+=3) {
      const p = Vector3.TransformCoordinates(Vector3.FromArray(coords,i),matrix);
      points.push({x:(p.x+radius)*scale,z:(p.z+radius)*scale,y:p.y});
    }
    for (let i=0; i<indices.length; i+=3) {
      const a=points[indices[i]], b=points[indices[i+1]], c=points[indices[i+2]];
      const dx=b.x-a.x, dz=b.z-a.z, ex=c.x-a.x, ez=c.z-a.z;
      const det=dx*ez-dz*ex;
      if (Math.abs(det)<1e-7) continue;
      const x0=Math.max(0,Math.ceil(Math.min(a.x,b.x,c.x))), x1=Math.min(size-1,Math.floor(Math.max(a.x,b.x,c.x)));
      const z0=Math.max(0,Math.ceil(Math.min(a.z,b.z,c.z))), z1=Math.min(size-1,Math.floor(Math.max(a.z,b.z,c.z)));
      for (let z=z0;z<=z1;z++) for (let x=x0;x<=x1;x++) {
        const u=((x-a.x)*ez-(z-a.z)*ex)/det, v=(dx*(z-a.z)-dz*(x-a.x))/det;
        if (u>=0 && v>=0 && u+v<=1) {
          const j=z*size+x;
          heights[j]=Math.max(heights[j],a.y+u*(b.y-a.y)+v*(c.y-a.y));
        }
      }
    }
  }
  for (let i=0;i<heights.length;i++) {
    if (heights[i]<.3) heights[i]=soilHeight((i%size)/scale-radius,Math.floor(i/size)/scale-radius);
  }
  return (x,z) => {
    const u=Math.max(0,Math.min(size-1.001,(x+radius)*scale)), v=Math.max(0,Math.min(size-1.001,(z+radius)*scale));
    const col=Math.floor(u), row=Math.floor(v), j=row*size+col, t=u-col, w=v-row;
    return (1-w)*((1-t)*heights[j]+t*heights[j+1])+w*((1-t)*heights[j+size]+t*heights[j+size+1]);
  };
}
