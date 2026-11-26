import {Color3, Mesh, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Texture, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';

export function createSoilCollider(mesh) {
  return new PhysicsAggregate(mesh,PhysicsShapeType.MESH,{mass:0,friction:.85,restitution:0},mesh.getScene());
}

const radius = 1.32;
// The editable surface sits above the permanent gravel course in a blank jar.
export const blankDrainageLift = .19;
export function soilLevel(mounds, x, z) {
  let height = .13;
  for (const [cx, cz] of mounds) {
    const distanceSquared = (x-cx)**2 + (z-cz)**2;
    height += .25 * Math.exp(-distanceSquared / .15);
  }
  return Math.min(.98, height);
}

// The bank has separate UV islands for the top and side. Each U column
// of the cylindrical island ends at the actual (settled) shoulder of the jar.
function bankRim(earth) {
  const coordinates = earth.getVerticesData(VertexBuffer.PositionKind);
  const normals = earth.getVerticesData(VertexBuffer.NormalKind);
  const uv = earth.getVerticesData(VertexBuffer.UVKind);
  const world = earth.computeWorldMatrix(true);
  const indices = earth.getIndices();
  const columns = new Map();
  const low = new Vector3(), high = new Vector3();
  for (let i=0; i<indices.length; i+=3) {
    for (let corner=0; corner<3; corner++) {
      let a=indices[i+corner], b=indices[i+(corner+1)%3];
      if (coordinates[3*a+1] > coordinates[3*b+1]) [a,b]=[b,a];
      const u=uv[2*a];
      if (u !== uv[2*b]) continue;
      Vector3.TransformCoordinatesToRef(Vector3.FromArray(coordinates,3*a),world,low);
      Vector3.TransformCoordinatesToRef(Vector3.FromArray(coordinates,3*b),world,high);
      const rise=high.y-low.y;
      if (rise<=.04 || Math.hypot(high.x-low.x,high.z-low.z)>.4*rise ||
          Math.hypot(high.x,high.z)<1.20 || high.y <= (columns.get(u)?.y ?? -Infinity)) continue;
      const normal = Vector3.TransformNormal(Vector3.FromArray(normals,3*b),world).normalize();
      const v = uv[2*b+1];
      columns.set(u,{x:high.x,y:high.y,z:high.z,u,v,vPerUnit:(v-uv[2*a+1])/rise,normal});
    }
  }
  // The authored UV seam is at +X and its U increases clockwise.
  return columns.size > 2 ? [...columns.values()].sort((a,b)=>b.u-a.u) : null;
}

export function createEditorSoil(scene, mounds, restHeight, earth, inclusions, loose) {
  const mesh = new Mesh('Editor soil', scene);
  const rimColumns = earth && bankRim(earth);
  if (earth) {
    mesh.material = earth.material;
    mesh.sideOrientation = earth.sideOrientation;
  } else {
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
  }
  mesh.receiveShadows = true;
  let collider;
  function baseSurface(x,z) {
    const level = soilLevel(mounds,x,z);
    return restHeight ? Math.min(1.28,restHeight(x,z) + level-.13-.09) : level+blankDrainageLift;
  }
  function baseHeight(x,z) {
    const y=baseSurface(x,z);
    return restHeight ? Math.max(restHeight(x,z),y) : y;
  }
  function surface(x,z) {
    const fill=loose.marks.length ? loose.depth(x,z) : 0;
    if (fill<.0001) return baseSurface(x,z);
    const y=baseHeight(x,z)+fill;
    // Tuck the edge of the new soil below the original moss.
    return restHeight ? Math.max(baseSurface(x,z),y-Math.max(0,.088-4*fill)) : y;
  }
  function heightAt(x,z) {
    const y=surface(x,z);
    return restHeight ? Math.max(restHeight(x,z),y) : y;
  }
  function rebuild() {
    collider?.dispose();
    collider = null;
    mesh.setEnabled(!restHeight || mounds.length>0 || loose.marks.length>0);
    if (!mesh.isEnabled()) { inclusions?.mesh.setEnabled(false); return; }
    const segments = rimColumns ? rimColumns.length-1 : 128, rings = 36, tilesPerUnit = 1.4;
    const positions = [], indices = [], uvs = [], normals = [];
    const inBrush = [];
    function topVertex(x,z) {
      const y = surface(x,z);
      positions.push(x,y,z);
      if (earth) uvs.push(x*tilesPerUnit,1+z*tilesPerUnit);
      else uvs.push(.5+x*tilesPerUnit,.5+z*tilesPerUnit);
      // The authored bank already fills the jar. End the overlay just beneath
      // that surface outside each brush stroke, including at the glass.
      inBrush.push(!restHeight || y > restHeight(x,z)-.065);
    }
    function topTriangle(a,b,c) {
      if (inBrush[a] || inBrush[b] || inBrush[c]) indices.push(a,b,c);
    }
    topVertex(0,0);
    for (let ring = 1; ring <= rings; ring++) {
      const r = radius*ring/rings;
      for (let i=0; i<segments; i++) {
        const angle = 2*Math.PI*i/segments;
        if (rimColumns) topVertex(rimColumns[i].x*ring/rings,rimColumns[i].z*ring/rings);
        else topVertex(r*Math.cos(angle),r*Math.sin(angle));
      }
      const start = 1+(ring-1)*segments;
      for (let i=0; i<segments; i++) {
        const a = start+i, b = start+(i+1)%segments;
        if (ring === 1) topTriangle(0,b,a);
        else {
          topTriangle(a-segments,b,a);
          topTriangle(a-segments,b-segments,b);
        }
      }
    }

    // Unwrap the exposed section by arc length and height. Separate rim
    // vertices keep the top normal from rounding the whole vertical face.
    const rim = 1+(rings-1)*segments;
    const wall = positions.length/3;
    const repeats = Math.round(2*Math.PI*radius*tilesPerUnit);
    const rows = restHeight ? 2 : 3;
    for (let i=0; i<=segments; i++) {
      const source = 3*(rim+i%segments);
      const x = positions[source], top = positions[source+1], z = positions[source+2];
      const edge = rimColumns?.[i];
      if (restHeight) {
        const bottom = edge ? Math.min(top,edge.y) : .066;
        positions.push(x,top,z,x,bottom,z);
        const vAt = y => edge ? edge.v+(y-edge.y)*edge.vPerUnit : y*tilesPerUnit;
        const u = edge?.u ?? repeats*i/segments;
        uvs.push(u,vAt(top),u,vAt(bottom));
      } else {
        // Let the wall recede behind the two ranks of gravel. Keep the join
        // fixed when the player heaps soil up against the glass.
        const angle = 2*Math.PI*i/segments;
        const join = .235+.018*Math.sin(5*angle)+.011*Math.cos(3*angle);
        positions.push(x,top,z,x,join,z,x*.86,.066,z*.86);
        const u = repeats*i/segments;
        uvs.push(u,top*tilesPerUnit,u,join*tilesPerUnit,u,.066*tilesPerUnit);
      }
      if (i<segments && (inBrush[rim+i] || inBrush[rim+(i+1)%segments])) {
        for (let j=0;j<rows-1;j++) {
          const a = wall+rows*i+j, b = a+rows;
          indices.push(a,b+1,a+1,a,b,b+1);
        }
      }
    }
    VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
    // The duplicated texture seam shares the same radial normal on both sides.
    for (let i=0; i<=segments; i++) {
      const angle = 2*Math.PI*i/segments;
      for (let j=0;j<rows;j++) {
        const k = 3*(wall+rows*i+j);
        const normal = rimColumns?.[i].normal;
        normals[k]=normal?.x ?? Math.cos(angle);
        normals[k+1]=normal?.y ?? 0;
        normals[k+2]=normal?.z ?? Math.sin(angle);
      }
    }
    const data = new VertexData();
    Object.assign(data,{positions,indices,uvs,normals});
    data.applyToMesh(mesh);
    mesh.refreshBoundingInfo();
    inclusions?.refresh(mesh);
    collider = createSoilCollider(mesh);
  }
  rebuild();
  return {mesh,rebuild,heightAt,baseHeight};
}
