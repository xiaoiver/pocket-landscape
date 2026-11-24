import { Color3, Mesh, PBRMaterial, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import {glassInnerRadiusAt} from './glass.js';

const TAU = 2*Math.PI;
const PHI = (1+Math.sqrt(5))/2;
const ICO = [[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],
  [0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],
  [PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]];
const FACES = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
  [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
  [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
  [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const ROCK_TONES = [
  [.122,.103,.079],[.167,.147,.117],[.102,.093,.078],
  [.205,.170,.124],[.091,.083,.069],[.143,.121,.087],
];
const CLEARANCE = .009;
const MIN_HEIGHT = .082;

function random01(seed) {
  return () => {
    seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5;
    return (seed>>>0)/4294967296;
  };
}

function wiggle(angle) {
  return .50+.24*Math.sin(5*angle+.45)+.17*Math.sin(11*angle+.7)+.09*Math.cos(17*angle);
}

function prepareSoil(earth) {
  const source=earth.getVerticesData(VertexBuffer.PositionKind);
  const sourceNormals=earth.getVerticesData(VertexBuffer.NormalKind);
  const indices=earth.getIndices();
  if (!source||!sourceNormals||!indices) return undefined;
  const original=Float32Array.from(source), originalNormals=Float32Array.from(sourceNormals);
  const inset=Float32Array.from(source), insetNormals=Float32Array.from(sourceNormals);
  const moved=[];
  const world=earth.computeWorldMatrix(true), inverse=world.clone().invert();
  for(let i=0;i<source.length;i+=3) {
    const p=Vector3.TransformCoordinates(Vector3.FromArray(source,i),world);
    const r=Math.hypot(p.x,p.z);
    // Only the first two profile rows of this GLB, never the top or its upper side.
    if(p.y < .078 || p.y > .135 || r < 1.28) continue;
    const a=Math.atan2(p.z,p.x);
    const depth=.052+.050*wiggle(a);
    const scale=(r-depth)/r;
    p.x*=scale; p.z*=scale;
    Vector3.TransformCoordinates(p,inverse).toArray(inset,i);
    moved.push(i);
  }
  if (!moved.length) return undefined;
  const generatedNormals=[];
  VertexData.ComputeNormals(inset,indices,generatedNormals,{useRightHandedSystem:earth.getScene().useRightHandedSystem});
  for(const i of moved) {
    // Only update normals for recessed vertices; retain the original tangent plane above.
    let nx=generatedNormals[i],ny=generatedNormals[i+1],nz=generatedNormals[i+2];
    if(nx*originalNormals[i]+ny*originalNormals[i+1]+nz*originalNormals[i+2]<0){nx=-nx;ny=-ny;nz=-nz;}
    insetNormals[i]=nx;insetNormals[i+1]=ny;insetNormals[i+2]=nz;
  }
  // Keep the imported GPU color/UV attributes, indices, mesh identity and existing shadow membership.
  earth.setVerticesData(VertexBuffer.PositionKind,original,true);
  earth.setVerticesData(VertexBuffer.NormalKind,originalNormals,true);
  return {moved:moved.length, totalVertices:source.length/3, apply(active) {
    // The original conservative bounding box still contains the recessed geometry.
    earth.updateVerticesData(VertexBuffer.PositionKind,active ? inset : original,false);
    earth.updateVerticesData(VertexBuffer.NormalKind,active ? insetNormals : originalNormals,false);
  }};
}

function stones(scene) {
  const random=random01(0xa930573d);
  const positions=[],colors=[],indices=[],normals=[];
  let count=0,minGap=Infinity,maxHeight=0,minHeight=Infinity;
  for(let band=0;band<3;band++) {
    const cells=[122,112,96][band];
    for(let i=0;i<cells;i++) {
      const angle=TAU*(i+.72*random()+.27*band)/cells;
      const shape=wiggle(angle);
      // A broken, irregular crest: isolated embedded stones push into the soil above.
      if(random() > [.95,.80,.23+.36*shape][band]) continue;
      const a=angle+(.011*(random()-.5));
      const y=[.109,.149,.188][band]+(random()-.5)*(.022+.006*band)+(.007+.022*band)*(shape-.36);
      const rad=glassInnerRadiusAt(y)-(.034+.017*random());
      const width=.030+.025*random(), height=.018+.014*random(), depth=.027+.025*random();
      const yaw=(random()-.5)*1.5, c=Math.cos(yaw),s=Math.sin(yaw);
      const tone=ROCK_TONES[Math.floor(random()*ROCK_TONES.length)];
      const points=ICO.map(([x,v,z])=>{
        const l=Math.hypot(x,v,z), j=.76+.47*random();
        const localRad=j*depth*(x*c-z*s)/l;
        const localTan=j*width*(x*s+z*c)/l;
        const sy=Math.max(MIN_HEIGHT,y+j*height*v/l);
        let px=(rad+localRad)*Math.cos(a)-localTan*Math.sin(a);
        let pz=(rad+localRad)*Math.sin(a)+localTan*Math.cos(a);
        const pr=Math.hypot(px,pz);
        // The inner-wall radius is piecewise linear. A small extra gap covers face
        // interiors across the rounded heel's profile break.
        const bound=glassInnerRadiusAt(sy)-CLEARANCE-.003;
        if(pr>bound){px*=bound/pr;pz*=bound/pr;}
        minGap=Math.min(minGap,glassInnerRadiusAt(sy)-Math.hypot(px,pz));
        minHeight=Math.min(minHeight,sy);
        maxHeight=Math.max(maxHeight,sy);
        return [px,sy,pz];
      });
      for(const f of FACES) {
        const [p,q,r]=f.map(v=>points[v]);
        const base=positions.length/3;
        // Flat facets and small facet color variation; mostly muddy adjacent hues.
        const light=.89+.23*random();
        for(const vertex of [p,r,q]) {
          positions.push(...vertex);
          colors.push(tone[0]*light,tone[1]*light,tone[2]*light,1);
        }
        indices.push(base,base+1,base+2);
      }
      count++;
    }
  }
  const vertexData=new VertexData();
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:scene.useRightHandedSystem});
  vertexData.positions=positions;vertexData.indices=indices;vertexData.normals=normals;vertexData.colors=colors;
  const mesh=new Mesh('Drainage gravel · local geometry',scene);
  vertexData.applyToMesh(mesh);
  const material=new PBRMaterial('Muted wet gravel',scene);
  material.metallic=0;material.roughness=.86;material.albedoColor=Color3.White();
  // Test on both sides across the vessel; slope intersections do not expose transparent gaps.
  material.backFaceCulling=false;material.twoSidedLighting=true;
  mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
  mesh.metadata={count,minGap,minHeight,maxHeight,triangles:indices.length/3};
  return mesh;
}

export function installDrainage(scene, earth) {
  if(!earth) return undefined;
  const soil=prepareSoil(earth);
  if(!soil) return undefined;
  const gravel=stones(scene);
  gravel.setEnabled(false);
  return {gravel,soilMeta:{changedLowVertices:soil.moved,totalVertices:soil.totalVertices},setEnabled(active) {
    soil.apply(active);
    gravel.setEnabled(active);
  }};
}
