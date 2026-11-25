import {DynamicTexture, Mesh, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Vector3} from '@babylonjs/core';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';

function makeStopper(scene) {
  const cork = MeshBuilder.CreateCylinder('Tapered cork stopper',{
    height:.22,diameterTop:1.49,diameterBottom:1.35,tessellation:72,
  },scene);
  const texture = new DynamicTexture('Cork grain',256,scene,false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#b88958';
  ctx.fillRect(0,0,256,256);
  for (let i=0;i<6800;i++) {
    ctx.fillStyle = ['#d4ac80','#996d4b','#a27953','#75553a'][i%4];
    ctx.globalAlpha = .3+Math.random()*.4;
    ctx.fillRect(Math.random()*256,Math.random()*256,1+Math.random()*3,1+Math.random()*2);
  }
  texture.update();
  const material = new PBRMaterial('Natural cork',scene);
  material.albedoTexture = texture;
  material.metallic = 0;
  material.roughness = .96;
  cork.material = material;
  cork.receiveShadows = true;
  cork.isPickable = false;
  return cork;
}

export function createEditorVessel(scene, glass, shadows, initialType, initiallySealed) {
  const cork = makeStopper(scene);
  shadows.addShadowCaster(cork);
  glass.addContents?.([cork]);
  let shell, lid, type, sealed;
  function setSealed(value) {
    sealed = type === 'bottle' && value;
    lid?.dispose();
    lid = null;
    cork.setEnabled(type === 'bottle');
    if (sealed) {
      cork.position.set(0,2.10,0);
      lid = new PhysicsAggregate(cork,PhysicsShapeType.CYLINDER,{mass:0,friction:.6},scene);
    } else {
      cork.position.set(1.96,.113,.24);
    }
  }
  function setType(next, close = next === 'bottle') {
    shell?.dispose();
    type = next;
    glass.setVessel(type);
    const wall = vesselWalls[type];
    const shape = wall.map(([,y]) => new Vector3(glassInnerRadiusAt(y,wall),y,0));
    shell = MeshBuilder.CreateLathe('Jar collision wall',{shape,tessellation:64,sideOrientation:Mesh.DOUBLESIDE},scene);
    shell.isVisible = shell.isPickable = false;
    new PhysicsAggregate(shell,PhysicsShapeType.MESH,{mass:0,friction:.48,restitution:.12},scene);
    setSealed(close);
  }
  setType(initialType,initiallySealed);
  return {setType,setSealed,get type(){return type;},get sealed(){return sealed;}};
}
