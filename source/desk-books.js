import {TransformNode} from '@babylonjs/core';

export function createDeskBooks(scene,meshes,casement) {
  const root=new TransformNode('Desk book stack',scene);
  for (const mesh of meshes) {
    mesh.parent=root;
    mesh.receiveShadows=true;
    mesh.isPickable=false;
  }

  // Desk props translate without rotating. Keep their footprint in stack-local space.
  let left=Infinity,right=-Infinity,near=Infinity,far=-Infinity,height=0;
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const {minimumWorld:min,maximumWorld:max}=mesh.getBoundingInfo().boundingBox;
    left=Math.min(left,min.x); right=Math.max(right,max.x);
    near=Math.min(near,min.z); far=Math.max(far,max.z); height=Math.max(height,max.y);
  }
  const home=[-2.28,-.94];
  function positionAt([x,z]=home) {root.position.set(x,0,z);}
  function clearsCircle(cx,cz,r,x=root.position.x,z=root.position.z) {
    const dx=Math.max(x+left-cx,0,cx-x-right), dz=Math.max(z+near-cz,0,cz-z-far);
    return Math.hypot(dx,dz)>r+.02;
  }
  function canStandAt(x,z) {
    return Math.hypot(x,z)<8.5 && clearsCircle(0,0,1.45,x,z) &&
      [left,right].every(dx=>[near,far].every(dz=>casement.distanceFromWall(x+dx,z+dz)>.18));
  }
  positionAt();
  return {meshes,height,position:root.position,home,positionAt,clearsCircle,canStandAt};
}
