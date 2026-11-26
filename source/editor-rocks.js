import {Matrix, PhysicsAggregate, PhysicsShapeType} from '@babylonjs/core';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';

const scans = ['01','02','03','04','05','06'];
const modelName = scan => 'Woodland outcrop · '+scan;
export const rockModelNames = scans.map(modelName);
export const maxRocks = 24;

export function createEditorRocks({scene,glass,shadows,heightAt,vessel,preset,sources,saved}) {
  const templates = new Map(), placed = new Map();
  for (const scan of scans) {
    const source = sources.find(m=>m.name===modelName(scan));
    const mesh = preset ? source.clone('Landscape rock template '+scan,null,true) : source;
    if (preset) mesh.makeGeometryUnique();
    mesh.setEnabled(false);
    mesh.parent = null;
    mesh.position.setAll(0);
    mesh.rotationQuaternion = null;
    mesh.rotation.setAll(0);
    mesh.scaling.setAll(1);
    const {minimum,maximum,center,extendSize} = mesh.getBoundingInfo().boundingBox;
    const height = maximum.y-minimum.y, radius = Math.hypot(extendSize.x,extendSize.z);
    mesh.geometry.useBoundingInfoFromGeometry = false;
    mesh.bakeTransformIntoVertices(Matrix.Translation(-center.x,-minimum.y-.24*height,-center.z));
    mesh.refreshBoundingInfo();
    templates.set(scan,{mesh,height,radius});
  }
  const colliders = new Map();
  function settle(mesh,pose) {
    colliders.get(mesh)?.dispose();
    const {height,radius} = templates.get(pose.scan);
    let {x,z} = pose;
    for (let i=0;i<6;i++) {
      const top = heightAt(x,z)+height*.76;
      const limit = Math.max(0,Math.min(1.31,glassInnerRadiusAt(top,vesselWalls[vessel.type]))-radius-.012);
      const distance = Math.hypot(x,z);
      if (distance<=limit) break;
      x *= limit/distance;
      z *= limit/distance;
    }
    mesh.position.set(x,heightAt(x,z),z);
    mesh.rotationQuaternion = null;
    mesh.rotation.set(0,pose.yaw,0);
    mesh.computeWorldMatrix(true);
    colliders.set(mesh,new PhysicsAggregate(mesh,PhysicsShapeType.MESH,{mass:0,friction:.85,restitution:0},scene));
  }
  function add(pose) {
    const mesh = templates.get(pose.scan).mesh.clone('Landscape rock · '+pose.scan,null,true);
    mesh.setEnabled(true);
    mesh.receiveShadows = mesh.isPickable = true;
    glass.addContents?.([mesh]);
    shadows.addShadowCaster(mesh);
    placed.set(mesh,pose);
    settle(mesh,pose);
  }
  function remove(mesh) {
    colliders.get(mesh).dispose();
    colliders.delete(mesh);
    placed.delete(mesh);
    glass.removeContents?.([mesh]);
    shadows.removeShadowCaster(mesh);
    mesh.dispose();
  }
  function restore(poses) {
    for (const mesh of placed.keys()) remove(mesh);
    if (!Array.isArray(poses)) return;
    for (const pose of poses.slice(0,maxRocks)) {
      if (pose && templates.has(pose.scan) && [pose.x,pose.z,pose.yaw].every(Number.isFinite) &&
          Math.hypot(pose.x,pose.z)<=1.34) add(pose);
    }
  }
  restore(saved);
  return {
    placed,remove,restore,settle,
    settleAll() {
      for (const [mesh,pose] of placed) settle(mesh,pose);
    },
    place(x,z) {
      const scan = scans[Math.floor(Math.random()*scans.length)];
      add({scan,x,z,yaw:Math.random()*2*Math.PI});
    },
  };
}
