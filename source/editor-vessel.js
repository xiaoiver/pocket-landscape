import {MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Vector3, Vector4} from '@babylonjs/core';
import {createCorkGrain} from './cork-grain.js';
import {createVesselWall, INNER_WALL_INSET, vesselWalls} from './glass.js';

const corkHeight = .22, corkTopRadius = .71;
const [neckRadius,neckHeight] = vesselWalls.bottle.at(-1);
const parkedX = Math.max(...vesselWalls.bottle.map(([r])=>r))+corkTopRadius+.14;

function makeStopper(scene) {
  const cork = MeshBuilder.CreateCylinder('Tapered cork stopper',{
    height:corkHeight,diameterTop:2*corkTopRadius,diameterBottom:2*(neckRadius-.05),tessellation:72,subdivisions:12,
    faceUV:[new Vector4(0,0,1,1),new Vector4(0,0,3,.16),new Vector4(0,0,1,1)],
  },scene);
  const positions=cork.getVerticesData('position'), normals=cork.getVerticesData('normal');
  for (let i=0;i<positions.length;i+=3) {
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    const radius=Math.hypot(x,z);
    if (radius<.001) continue;
    const angle=Math.atan2(z,x);
    const h=y/corkHeight+.5;
    const wornEdge=Math.max(0,(h-.82)/.18);
    const chip=.003*Math.sin(11*angle)+.0018*Math.cos(23*angle);
    const scale=1-(.014*wornEdge*wornEdge+Math.abs(chip))/radius;
    positions[i]*=scale;
    positions[i+2]*=scale;
    positions[i+1]+=chip*wornEdge;
    if (wornEdge>0 && normals[i+1]<.99) {
      const n=new Vector3(x/radius,normals[i+1]+1.4*wornEdge,z/radius).normalize();
      n.toArray(normals,i);
    }
  }
  cork.setVerticesData('position',positions);
  cork.setVerticesData('normal',normals);

  const grain=createCorkGrain(scene);
  const material = new PBRMaterial('Natural cork',scene);
  material.albedoTexture=grain.color;
  material.bumpTexture=grain.normal;
  material.metallic=0;
  material.roughness=1;
  material.metallicF0Factor=.32;
  cork.material = material;
  cork.receiveShadows = true;
  cork.isPickable = false;
  return cork;
}

export function createEditorVessel(scene, glass, shadows, initialType, initiallySealed, lamp, books) {
  const cork = makeStopper(scene);
  shadows.addShadowCaster(cork);
  glass.addContents?.([cork]);
  let shell, lid, type, sealed;
  function clearsParkedCork(x,z) {
    return Math.hypot(x-cork.position.x,z-cork.position.z)>corkTopRadius+.405+.02;
  }
  function parkCork() {
    for (const [x,z] of [[parkedX,.53],[-parkedX,.53],[0,parkedX],[0,-parkedX]]) {
      cork.position.set(x,corkHeight/2,z);
      if (clearsParkedCork(lamp.position.x,lamp.position.z) && books.clearsCircle(x,z,corkTopRadius)) break;
    }
  }
  function setSealed(value) {
    sealed = type === 'bottle' && value;
    lid?.dispose();
    lid = null;
    cork.setEnabled(type === 'bottle');
    if (sealed) {
      cork.position.set(0,neckHeight+.02,0);
      cork.computeWorldMatrix(true);
      lid = new PhysicsAggregate(cork,PhysicsShapeType.CONVEX_HULL,{mass:0,friction:.6},scene);
    } else {
      parkCork();
    }
  }
  function setType(next, close = next === 'bottle') {
    shell?.dispose();
    type = next;
    glass.setVessel(type);
    shell=createVesselWall(scene,'Jar collision wall',type,{inset:INNER_WALL_INSET,collision:true});
    shell.isVisible = shell.isPickable = false;
    new PhysicsAggregate(shell,PhysicsShapeType.MESH,{mass:0,friction:.48,restitution:.12},scene);
    setSealed(close);
  }
  setType(initialType,initiallySealed);
  function canPlaceBooks(x,z) {
    return type!=='bottle' || sealed || books.clearsCircle(cork.position.x,cork.position.z,corkTopRadius,x,z);
  }
  function canPlaceLamp(x,z) {
    return type!=='bottle' || sealed || clearsParkedCork(x,z);
  }
  return {setType,setSealed,parkCork,canPlaceBooks,canPlaceLamp,get type(){return type;},get sealed(){return sealed;}};
}
