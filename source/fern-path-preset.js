import {PhysicsAggregate, PhysicsShapeType} from '@babylonjs/core';
import {enableLeafPicking} from './leaf-picking.js';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';
import {fitBowlFoliage} from './slant-bowl.js';
import {indexPath} from './preset-path.js';

// Keep original geometry and material assignments. Saved copies store only
// changes from the authored positions, so an untouched copy opens identically.
export function editFernPath({base,specimens,pathMesh}, heightAt, restHeight, saved, vessel) {
  const objects=new Map(), byMesh=new Map(), changes=new Map(), atlases=new Map();
  const path=indexPath(pathMesh);
  for (const piece of path.pieces) objects.set(piece.id,piece);
  const staticOptions={mass:0,friction:.65,restitution:.12};
  function collider(mesh) {
    return new PhysicsAggregate(mesh,PhysicsShapeType.MESH,staticOptions,mesh.getScene());
  }
  let pathBody;
  const foliage=[];
  function updatePath() {
    pathBody?.dispose();
    path.flush();
    pathBody=collider(pathMesh);
  }
  function group(id, meshes, solid=false) {
    if (!meshes.length) return;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,minY=Infinity,maxY=-Infinity;
    const origins=meshes.map(mesh => {
      mesh.computeWorldMatrix(true);
      const {minimumWorld:min,maximumWorld:max}=mesh.getBoundingInfo().boundingBox;
      minX=Math.min(minX,min.x);maxX=Math.max(maxX,max.x);
      minZ=Math.min(minZ,min.z);maxZ=Math.max(maxZ,max.z);
      minY=Math.min(minY,min.y);maxY=Math.max(maxY,max.y);
      byMesh.set(mesh,id);
      if (!solid) enableLeafPicking(mesh,atlases);
      else mesh.isPickable=true;
      return mesh.position.clone();
    });
    const originalWorld=solid ? [] : meshes.map(mesh=>mesh.getWorldMatrix().clone());
    const scales=meshes.map(mesh => mesh.scaling.clone());
    const bodies=[];
    if (!solid) foliage.push(id);
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
    objects.set(id,{id,x,z,radius:Math.min(1.2,Math.hypot(maxX-minX,maxZ-minZ)/2),place(dx,dy,dz,removed) {
      for (const body of bodies) body.dispose();
      bodies.length=0;
      // The open preset grows above its rim. Fit those crowns under the
      // shoulder and stopper only when the narrower vessel is selected.
      let scale=1;
      if (!solid && vessel.type==='bowl') {
        scale=fitBowlFoliage(meshes,originalWorld,x,minY,z,dx,dy,dz);
      } else if (!solid && vessel.type==='bottle') {
        const span=Math.hypot(maxX-minX,maxZ-minZ)/2;
        const r=Math.hypot(x+dx,z+dz);
        let low=0, high=1;
        for (let i=0;i<12;i++) {
          const mid=(low+high)/2, top=minY+dy+(maxY-minY)*mid;
          if (top<=1.96 && r+span*mid<=glassInnerRadiusAt(top,vesselWalls.bottle)-.01) low=mid;
          else high=mid;
        }
        scale=low;
      }
      meshes.forEach((mesh,i) => {
        mesh.setEnabled(!removed);
        mesh.scaling.copyFrom(scales[i]).scaleInPlace(scale);
        mesh.position.set(origins[i].x*scale+x*(1-scale)+dx,
          origins[i].y*scale+minY*(1-scale)+dy,origins[i].z*scale+z*(1-scale)+dz);
        mesh.computeWorldMatrix(true);
        if (solid && !removed) bodies.push(collider(mesh));
      });
    }});
  }
  for (const mesh of [...base,...specimens]) {
    if (/^(Woodland outcrop|Weathered granite)/.test(mesh.name)) group(mesh.name,[mesh],true);
    if (specimens.includes(mesh)) group(mesh.name,[mesh]);
  }
  group('canopy',base.filter(m=>m.name.startsWith('Canopy ')));
  group('variegated-fittonia',base.filter(m=>m.name.startsWith('Fittonia ·') || m.name==='Petioles'));
  pathMesh.isPickable=true;

  for (const [id,pose] of Object.entries(saved || {})) {
    if (objects.has(id) && (pose===null || (Array.isArray(pose) && pose.length===2 && pose.every(Number.isFinite) && Math.hypot(...pose)<=1.34))) changes.set(id,pose);
  }
  function settle(item) {
    const pose=changes.get(item.id);
    const [x,z]=pose || [item.x,item.z];
    const dy=heightAt(x,z)-restHeight(item.x,item.z);
    item.place(x-item.x,dy,z-item.z,pose===null);
  }
  function settleAll() {
    for (const item of objects.values()) settle(item);
    updatePath();
  }
  function change(item,pose) {
    changes.set(item.id,pose);
    settle(item);
    if (item.id.startsWith('gravel-')) updatePath();
  }
  settleAll();
  return {
    restore(edits) {
      changes.clear();
      for (const [id,pose] of Object.entries(edits)) changes.set(id,pose);
      settleAll();
    },
    settleAll, fitVessel() {for (const id of foliage) settle(objects.get(id));},
    serialize:()=>Object.fromEntries(changes),
    pickable:mesh=>mesh.isEnabled() && mesh.isPickable && (mesh===pathMesh || byMesh.has(mesh)),
    location:item=>changes.get(item.id) || [item.x,item.z],
    picked:hit=>objects.get(hit.pickedMesh===pathMesh ? path.faceKeys[hit.faceId] : byMesh.get(hit.pickedMesh)),
    remove:item=>change(item,null),
    move(item,x,z) {
      const r=Math.hypot(x,z), limit=Math.max(.12,1.32-item.radius);
      const factor=r>limit ? limit/r : 1;
      change(item,[x*factor,z*factor]);
    },
  };
}
