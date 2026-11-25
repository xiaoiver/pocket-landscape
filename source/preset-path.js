import {VertexBuffer} from '@babylonjs/core';

// Each authored pebble is a connected island of triangles. Keep the path in
// one draw call, using the picked face to identify the individual stone.
export function indexPath(mesh) {
  const rest = mesh.getVerticesData(VertexBuffer.PositionKind);
  const positions = Float32Array.from(rest), indices = mesh.getIndices();
  const parents = Array.from({length:rest.length/3},(_,i)=>i);
  function root(i) {
    while (parents[i]!==i) { parents[i]=parents[parents[i]]; i=parents[i]; }
    return i;
  }
  const seams = new Map();
  for (let i=0;i<parents.length;i++) {
    const key = rest[i*3]+','+rest[i*3+1]+','+rest[i*3+2];
    if (seams.has(key)) parents[i]=seams.get(key);
    else seams.set(key,i);
  }
  for (let i=0;i<indices.length;i+=3) {
    const parent = root(indices[i]);
    parents[root(indices[i+1])]=parent;
    parents[root(indices[i+2])]=parent;
  }
  const parts=new Map();
  for (let i=0;i<parents.length;i++) {
    const id=root(i);
    if (!parts.has(id)) parts.set(id,[]);
    parts.get(id).push(i*3);
  }
  const faceKeys=Array.from({length:indices.length/3},(_,i)=>'gravel-'+root(indices[i*3]));
  const pieces=[];
  for (const [id,offsets] of parts) {
    let x=0,z=0;
    for (const i of offsets) {x+=rest[i];z+=rest[i+2];}
    x/=offsets.length;z/=offsets.length;
    let radius=0;
    for (const i of offsets) radius=Math.max(radius,Math.hypot(rest[i]-x,rest[i+2]-z));
    pieces.push({id:'gravel-'+id,x,z,radius,place(dx,dy,dz,removed) {
      for (const i of offsets) {
        positions[i]=removed ? x : rest[i]+dx;
        positions[i+1]=removed ? .1 : rest[i+1]+dy;
        positions[i+2]=removed ? z : rest[i+2]+dz;
      }
    }});
  }
  return {pieces,faceKeys,flush() {
    mesh.setVerticesData(VertexBuffer.PositionKind,positions,true);
    mesh.refreshBoundingInfo();
  }};
}
