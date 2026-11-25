import {Color3, Mesh, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Texture, VertexData} from '@babylonjs/core';

// Both picking and physics use this same tessellated surface.
const radius = 1.32;
export function soilLevel(mounds, x, z) {
  let height = .13;
  for (const [cx, cz] of mounds) {
    const distanceSquared = (x-cx)**2 + (z-cz)**2;
    height += .25 * Math.exp(-distanceSquared / .15);
  }
  return Math.min(.98, height);
}

export function createEditorSoil(scene, mounds, restHeight) {
  const mesh = new Mesh('Editor soil', scene);
  const soil = new PBRMaterial('Loose humus', scene);
  const texture = id => new Texture('data:image/jpeg;base64,' + document.getElementById(id).textContent, scene, false, false);
  soil.albedoTexture = texture('substrate-humus');
  soil.bumpTexture = texture('substrate-humus-normal');
  soil.bumpTexture.level = .55;
  soil.albedoColor = new Color3(.62,.52,.42);
  soil.roughness = .95;
  soil.metallic = 0;
  soil.backFaceCulling = false;
  mesh.material = soil;
  mesh.receiveShadows = true;
  let collider;
  function surface(x,z,brushes=mounds) {
    const level = soilLevel(brushes,x,z);
    return restHeight ? Math.min(1.28,restHeight(x,z) + level-.13-.09) : level;
  }
  function heightAt(x,z,brushes=mounds) {
    return restHeight ? Math.max(restHeight(x,z),surface(x,z,brushes)) : surface(x,z,brushes);
  }
  function rebuild() {
    collider?.dispose();
    collider = null;
    mesh.setEnabled(!restHeight || mounds.length>0);
    if (!mesh.isEnabled()) return;
    const segments = 64, rings = 22;
    const positions = [0, surface(0,0), 0], indices = [], uvs = [.5,.5], normals = [];
    for (let ring = 1; ring <= rings+1; ring++) {
      const r = radius * Math.min(ring, rings) / rings;
      for (let i = 0; i < segments; i++) {
        const angle = 2*Math.PI*i/segments;
        const x = r*Math.cos(angle), z = r*Math.sin(angle);
        const y = ring > rings ? .066 : surface(x,z);
        positions.push(x,y,z);
        uvs.push(x*1.4+.5,z*1.4+.5+y*.3);
        const a = 1+(ring-1)*segments+i, b = 1+(ring-1)*segments+(i+1)%segments;
        if (ring === 1) indices.push(0,b,a);
        else indices.push(a-segments,b,a, a-segments,b-segments,b);
      }
    }
    VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
    const data = new VertexData();
    Object.assign(data,{positions,indices,uvs,normals});
    data.applyToMesh(mesh);
    mesh.refreshBoundingInfo();
    collider = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {mass:0, friction:.65, restitution:.09},scene);
  }
  rebuild();
  return {mesh,rebuild,heightAt};
}
