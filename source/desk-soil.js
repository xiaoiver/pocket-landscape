import {Material,Mesh,MeshBuilder,PBRMaterial,PhysicsAggregate,PhysicsShapeType,Vector3,VertexData} from '@babylonjs/core';
import {bowlLipAt} from './slant-bowl.js';
import {spillSectors} from './loose-soil.js';

// The volume ledger already includes soil in flight, so saving in midair is
// atomic. Only the live rendering withholds it until the clods land.
export function createDeskSoil(scene,glass,shadows,soilMaterial,volumes) {
  const material=new PBRMaterial('Loose desk humus',scene);
  material.albedoTexture=soilMaterial.albedoTexture;
  material.bumpTexture=soilMaterial.bumpTexture;
  material.albedoColor=soilMaterial.albedoColor.clone();
  material.metallic=0;material.roughness=1;material.metallicF0Factor=.32;
  const pile=new Mesh('Spilled soil on desk',scene);
  pile.sideOrientation=Material.CounterClockWiseSideOrientation;
  pile.material=material;pile.receiveShadows=true;pile.isPickable=false;
  glass.addContents?.([pile]);shadows.addShadowCaster(pile);
  const pending=new Float64Array(spillSectors), flights=[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let floor, patches=[];
  function height(x,z) {
    let h=0;
    for (const p of patches) {
      const a=Math.atan2(z-p.z,x-p.x);
      const width=p.width*(1+.07*Math.cos(5*a+3*p.x)+.07*Math.sin(3*a+p.z));
      const d=((x-p.x)**2+(z-p.z)**2)/(width*width);
      if (d<1) h+=p.peak*(1-d)**2;
    }
    return h;
  }
  function rebuild() {
    patches=[];
    for (let i=0;i<volumes.length;i++) {
      const v=volumes[i]-pending[i];
      if (v<1e-8) continue;
      const angle=i*2*Math.PI/spillSectors;
      const width=.10+1.26*Math.cbrt(v),r=1.345+width*.82;
      patches.push({sector:i,x:r*Math.cos(angle),z:r*Math.sin(angle),width,peak:3*v/(Math.PI*width*width)});
    }
    pile.setEnabled(Boolean(patches.length));
    if (!patches.length) return;
    // A single continuous surface where neighboring deposits run together.
    const positions=[],indices=[],uvs=[],normals=[],vertices=new Map();
    const spacing=.029, edgeHeight=.0025;
    // Clip to an actual height contour. Drawing complete cells outside the
    // deposit leaves square steps and almost coplanar faces on the tabletop.
    const crossings=new Map();
    function point(x,y,z) {
      const index=positions.length/3;
      positions.push(x,y,z);uvs.push(x*.95,z*.95);
      return index;
    }
    function vertex(i,j) {
      const key=i+','+j;
      if (vertices.has(key)) return vertices.get(key);
      const x=i*spacing,z=j*spacing,h=height(x,z);
      const jitter=Math.sin(i*73.17+j*41.37)*43758.5453;
      const index=point(x,h*(.95+.10*(jitter-Math.floor(jitter))),z);
      vertices.set(key,index);return index;
    }
    function crossing(a,b) {
      const key=Math.min(a,b)+','+Math.max(a,b);
      if (crossings.has(key)) return crossings.get(key);
      const t=(edgeHeight-positions[3*a+1])/(positions[3*b+1]-positions[3*a+1]);
      const x=positions[3*a]+t*(positions[3*b]-positions[3*a]);
      const z=positions[3*a+2]+t*(positions[3*b+2]-positions[3*a+2]);
      const edge={top:point(x,edgeHeight,z),foot:point(x,-.0005,z)};
      crossings.set(key,edge);return edge;
    }
    function triangle(a,b,c) {
      const corners=[a,b,c],above=corners.map(v=>positions[3*v+1]>edgeHeight);
      if (above.every(Boolean)) {indices.push(a,b,c);return;}
      if (!above.some(Boolean)) return;
      const polygon=[];
      let enter,exit;
      for (let i=0;i<3;i++) {
        const j=(i+1)%3;
        if (above[i]) polygon.push(corners[i]);
        if (above[i]===above[j]) continue;
        const edge=crossing(corners[i],corners[j]);
        polygon.push(edge.top);
        if (above[i]) exit=edge; else enter=edge;
      }
      for (let i=1;i<polygon.length-1;i++) indices.push(polygon[0],polygon[i],polygon[i+1]);
      indices.push(enter.top,exit.top,exit.foot,enter.top,exit.foot,enter.foot);
    }
    const tiles=new Set();
    for (const p of patches) {
      for (let j=Math.floor((p.z-1.15*p.width)/spacing);j<(p.z+1.15*p.width)/spacing;j++) {
        for (let i=Math.floor((p.x-1.15*p.width)/spacing);i<(p.x+1.15*p.width)/spacing;i++) {
          const key=i+','+j;
          if (tiles.has(key) || Math.hypot((i+.5)*spacing-p.x,(j+.5)*spacing-p.z)>1.15*p.width+spacing) continue;
          tiles.add(key);
          const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1),d=vertex(i+1,j+1);
          triangle(a,c,b);triangle(b,c,d);
        }
      }
    }
    // Loose crumbs at the thin edge use the same draw call as the mound.
    for (const patch of patches) {
      for (let n=1;n<=14;n++) {
        const angle=n*2.39996+patch.x*7;
        const r=patch.width*(.82+.34*((n*7)%13)/13);
        const x=patch.x+r*Math.cos(angle),z=patch.z+r*Math.sin(angle);
        if (Math.hypot(x,z)<1.36) continue;
        const y=Math.max(.0015,height(x,z)),size=Math.min(.027,patch.width*(.017+.025*((n*3)%7)/7));
        const tip=positions.length/3;
        positions.push(x+.14*size,y+size*.83,z);uvs.push(x*.95,z*.95);
        for (let j=0;j<5;j++) {
          const a=angle+j*2*Math.PI/5,px=x+size*Math.cos(a),pz=z+size*.74*Math.sin(a);
          positions.push(px,y-.001,pz);uvs.push(px*.95,pz*.95);
          indices.push(tip,tip+1+(j+1)%5,tip+1+j);
        }
      }
    }
    VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
    const data=new VertexData();
    Object.assign(data,{positions,indices,uvs,normals});
    data.applyToMesh(pile);
    pile.refreshBoundingInfo();
  }
  function finish(f) {
    f.body?.dispose();
    glass.removeContents?.([f.mesh]);shadows.removeShadowCaster(f.mesh);f.mesh.dispose();
    pending[f.sector]=Math.max(0,pending[f.sector]-f.amount);
  }
  function sync() {
    for (const flight of flights) finish(flight);
    flights.length=0;pending.fill(0);rebuild();
  }
  function emit(overflow) {
    for (let sector=0;sector<overflow.length;sector++) {
      const volume=overflow[sector];
      if (volume<.00003 || reduced || flights.length>=28) continue;
      if (!floor) {
        floor=MeshBuilder.CreateBox('Desk soil collision surface',{width:12,depth:12,height:.10},scene);
        floor.position.y=-.051;floor.isVisible=floor.isPickable=false;
        new PhysicsAggregate(floor,PhysicsShapeType.BOX,{mass:0,friction:.94,restitution:0},scene);
      }
      const count=Math.min(28-flights.length,1+Math.floor(Math.min(3,volume/.0015)));
      for (let n=0;n<count;n++) {
        const angle=(sector+(Math.random()-.5)*.7)*2*Math.PI/spillSectors;
        const rim=bowlLipAt(angle),size=Math.min(.085,.55*Math.cbrt(volume/count));
        const mesh=MeshBuilder.CreateIcoSphere('Loose soil clod',{radiusX:size,radiusY:size*.72,radiusZ:size*.86,subdivisions:1},scene);
        mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;
        glass.addContents?.([mesh]);shadows.addShadowCaster(mesh);
        const dx=Math.cos(angle),dz=Math.sin(angle);
        const startR=Math.min(1.27,Math.hypot(rim.x,rim.z)-.09);
        mesh.position.set(startR*dx,rim.y+size+.10,startR*dz);
        pending[sector]+=volume/count;
        flights.push({mesh,sector,amount:volume/count,dx,dz,rim,size,startR,age:0});
      }
    }
    rebuild();
  }
  scene.onAfterPhysicsObservable.add(()=>{
    let dirty=false;
    for (let i=flights.length-1;i>=0;i--) {
      const f=flights[i];
      f.age+=scene.getPhysicsEngine().getSubTimeStep()/1000;
      if (!f.body) {
        const t=Math.min(1,f.age/.19),r=f.startR+(Math.hypot(f.rim.x,f.rim.z)+f.size+.024-f.startR)*t;
        f.mesh.position.set(r*f.dx,f.rim.y+f.size+.024+.076*(1-t),r*f.dz);
        if (t<1) continue;
        f.mesh.computeWorldMatrix(true);
        f.body=new PhysicsAggregate(f.mesh,PhysicsShapeType.CONVEX_HULL,{mass:.012,friction:.8,restitution:.04},scene);
        f.body.body.setLinearVelocity(new Vector3(.47*f.dx,-.12,.47*f.dz));
        f.body.body.setAngularVelocity(new Vector3(2*f.dz,1,-2*f.dx));
      } else {
        const {x,y,z}=f.mesh.position;
        if (y>Math.max(.005,height(x,z))+f.size*.8 && f.age<4) continue;
        finish(f);flights.splice(i,1);dirty=true;
      }
    }
    if (dirty) rebuild();
  });
  rebuild();
  function erase(point) {
    // Remove the nearest visible deposit, including its scattered crumbs.
    // Pending clods retain their volume until they reach the desk.
    let nearest, distance=Infinity;
    for (const patch of patches) {
      const d=Math.hypot(point.x-patch.x,point.z-patch.z)/patch.width;
      if (d<distance) {nearest=patch;distance=d;}
    }
    if (!nearest) return;
    volumes[nearest.sector]=pending[nearest.sector];
    rebuild();
  }
  return {mesh:pile,emit,sync,erase};
}
