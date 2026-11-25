import {glassInnerRadiusAt,vesselWalls} from './glass.js';
import {Matrix, PhysicsAggregate, PhysicsShapeType} from '@babylonjs/core';

export const maxAnimals = 12;
const kinds = ['fox','deer','hedgehog'];

export async function createEditorAnimals({scene,glass,shadows,loadPlantedModel,fox,heightAt,restHeight,vessel,layout}) {
  const placed = new Map(), templates = new Map(), bodies = new Map();
  let original;
  async function load(kind) {
    const mesh = kind === 'fox' && fox ? fox : (await loadPlantedModel('animal-'+kind))[0];
    mesh.setEnabled(false);
    const {minimum,maximum,center} = mesh.getBoundingInfo().boundingBox;
    if (mesh === fox) {
      original = {kind,x:center.x,z:center.z,yaw:0,lift:minimum.y-restHeight(center.x,center.z)};
      // GLTF supplies baked landscape bounds. Clones need bounds in the new local frame.
      mesh.geometry.useBoundingInfoFromGeometry = false;
      mesh.bakeTransformIntoVertices(Matrix.Translation(-center.x,-minimum.y,-center.z));
      mesh.refreshBoundingInfo();
    }
    const bounds = mesh.getBoundingInfo().boundingBox;
    const radius = Math.hypot(Math.max(-bounds.minimum.x,bounds.maximum.x),Math.max(-bounds.minimum.z,bounds.maximum.z));
    templates.set(kind,{mesh,radius,height:maximum.y-minimum.y});
  }
  const pending = new Map();
  function prepare(kind) {
    if (!pending.has(kind)) pending.set(kind,load(kind).catch(error => {pending.delete(kind);throw error;}));
    return pending.get(kind);
  }
  if (fox) await prepare('fox');
  function settle(mesh,pose) {
    bodies.get(mesh)?.dispose();
    const {radius,height} = templates.get(pose.kind);
    let x=pose.x, z=pose.z;
    for (let i=0;i<6;i++) {
      const top=heightAt(x,z)+(pose.lift || 0)+height;
      const limit=Math.min(1.31,glassInnerRadiusAt(top,vesselWalls[vessel.type])-.012)-radius;
      const distance=Math.hypot(x,z);
      if (distance<=limit) break;
      x *= limit/distance;
      z *= limit/distance;
    }
    const y=heightAt(x,z)+(pose.lift || 0);
    mesh.position.set(x,y,z);
    mesh.rotation.y = pose.yaw;
    mesh.scaling.setAll(vessel.type==='bottle' ? Math.min(1,(1.96-y)/height) : 1);
    mesh.computeWorldMatrix(true);
    bodies.set(mesh,new PhysicsAggregate(mesh,PhysicsShapeType.CONVEX_HULL,{mass:0,friction:.62},scene));
  }
  function add(pose) {
    const mesh = templates.get(pose.kind).mesh.clone('Figurine · '+pose.kind,null,true);
    mesh.rotationQuaternion = null;
    mesh.isPickable = mesh.receiveShadows = true;
    mesh.setEnabled(true);
    placed.set(mesh,pose);
    settle(mesh,pose);
    shadows.addShadowCaster(mesh);
    glass.addContents?.([mesh]);
    return mesh;
  }
  function remove(mesh) {
    bodies.get(mesh).dispose();
    bodies.delete(mesh);
    placed.delete(mesh);
    shadows.removeShadowCaster(mesh);
    glass.removeContents?.([mesh]);
    mesh.dispose();
  }
  let saved = layout.animals;
  if (!Array.isArray(saved)) {
    const legacy = fox && layout.edits?.[fox.name];
    if (Array.isArray(legacy) && legacy.length===2 && legacy.every(Number.isFinite)) [original.x,original.z]=legacy;
    saved = original && legacy!==null ? [original] : [];
  }
  const poses = saved.slice(0,maxAnimals).filter(p => p && kinds.includes(p.kind) &&
    [p.x,p.z,p.yaw].every(Number.isFinite) && Math.hypot(p.x,p.z)<=1.34 &&
    (p.lift===undefined || (Number.isFinite(p.lift) && Math.abs(p.lift)<1)));
  await Promise.all(poses.map(p => prepare(p.kind)));
  for (const pose of poses) add(pose);
  return {placed,prepare,add,remove,settle,settleAll() {for (const [mesh,pose] of placed) settle(mesh,pose);}};
}
