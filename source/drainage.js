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

const wrapDistance=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const smooth=(a,b,x)=>{const u=Math.min(1,Math.max(0,(x-a)/(b-a)));return u*u*(3-2*u);};
function prepareSoil(earth) {
  const source=earth.getVerticesData(VertexBuffer.PositionKind);
  const sourceNormals=earth.getVerticesData(VertexBuffer.NormalKind);
  const indices=earth.getIndices();
  if (!source||!sourceNormals||!indices) return undefined;
  const original=Float32Array.from(source), originalNormals=Float32Array.from(sourceNormals);
  const world=earth.computeWorldMatrix(true), inverse=world.clone().invert();
  const transformed=[];
  for(let i=0;i<source.length;i+=3) {
    const p=Vector3.TransformCoordinates(Vector3.FromArray(source,i),world);
    const r=Math.hypot(p.x,p.z);
    if(p.y < .078 || p.y > .135 || r < 1.28) continue;
    const a=Math.atan2(p.z,p.x);
    transformed.push({i,p,r,a,depth:.052+.050*wiggle(a)});
  }
  if(!transformed.length) return undefined;
  const compute=contacts=>{
    const positions=Float32Array.from(source),normals=Float32Array.from(sourceNormals);
    const generated=[]; let contactVertices=0,minGap=Infinity;
    for(const {i,p,r,a,depth} of transformed) {
      let collar=0;
      for(const stone of contacts) {
        const d=wrapDistance(a,stone.a);
        collar=Math.max(collar,(1-smooth(.009,.064,d))*(p.y>.105?.038:.013));
      }
      if(collar>0)contactVertices++;
      const radius=Math.min(r-depth+collar,glassInnerRadiusAt(p.y)-.015);
      minGap=Math.min(minGap,glassInnerRadiusAt(p.y)-radius);
      Vector3.TransformCoordinates(new Vector3(p.x*radius/r,p.y,p.z*radius/r),inverse).toArray(positions,i);
    }
    VertexData.ComputeNormals(positions,indices,generated,{useRightHandedSystem:earth.getScene().useRightHandedSystem});
    for(const {i} of transformed) {
      let nx=generated[i],ny=generated[i+1],nz=generated[i+2];
      if(nx*originalNormals[i]+ny*originalNormals[i+1]+nz*originalNormals[i+2]<0){nx=-nx;ny=-ny;nz=-nz;}
      normals[i]=nx;normals[i+1]=ny;normals[i+2]=nz;
    }
    return {positions,normals,contactVertices,minGap};
  };
  earth.setVerticesData(VertexBuffer.PositionKind,original,true);
  earth.setVerticesData(VertexBuffer.NormalKind,originalNormals,true);
  return {moved:transformed.length,totalVertices:source.length/3,compute,apply(state) {
    earth.updateVerticesData(VertexBuffer.PositionKind,state?.positions??original,false);
    earth.updateVerticesData(VertexBuffer.NormalKind,state?.normals??originalNormals,false);
  }};
}

function stones(scene) {
  const random=random01(0xa930573d);
  const positions=[],colors=[],indices=[],crest=[];
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
      if(band===2)crest.push({a,y,width,depth,start:positions.length/3,stoneId:count});
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
  // One larger crest stone per sparse angular sector, no RNG calls and no new triangles.
  const sectors=new Map();
  for(const s of crest) {
    const bin=Math.floor(((s.a+TAU+.079)%TAU)/(TAU/16));
    const current=sectors.get(bin);
    const score=stone=>stone.width+.4*stone.depth;
    if(!current||score(s)>score(current))sectors.set(bin,s);
  }
  const contacts=[];
  for(const s of [...sectors.values()].sort((a,b)=>b.width-a.width)){
    if(contacts.every(x=>wrapDistance(s.a,x.a)>.115))contacts.push(s);
  }
  const seatedNormals=[];
  let minimumSeatedGap=Infinity,aoVertices=0;
  for(const s of contacts) {
    const dx=Math.cos(s.a),dz=Math.sin(s.a);
    for(let k=s.start;k<s.start+FACES.length*3;k++){
      const i=k*3,j=k*4;
      const nudge=.021+(s.stoneId%4)*.003;
      // Keep the outward faces readable; tuck the stone into the collar and lower it slightly.
      positions[i]-=nudge*dx;positions[i+2]-=nudge*dz;
      positions[i+1]=Math.max(MIN_HEIGHT,positions[i+1]-(.010+(s.stoneId%3)*.002));
      const r=Math.hypot(positions[i],positions[i+2]);
      const signed=glassInnerRadiusAt(positions[i+1])-r;
      minimumSeatedGap=Math.min(minimumSeatedGap,signed);
      const outer=(positions[i]*dx+positions[i+2]*dz);
      const contact=(1-smooth(s.y-.018,s.y+.010,positions[i+1]))*(1-smooth(1.24,1.30,outer));
      if(contact>.01)aoVertices++;
      // A small crevice-only AO proxy; no texture or change of stone hue.
      const shade=1-.17*contact;
      for(let c=0;c<3;c++)colors[j+c]*=shade;
    }
  }
  VertexData.ComputeNormals(positions,indices,seatedNormals,{useRightHandedSystem:scene.useRightHandedSystem});
  const vertexData=new VertexData();
  vertexData.positions=positions;vertexData.indices=indices;vertexData.normals=seatedNormals;vertexData.colors=colors;
  const mesh=new Mesh('Drainage gravel · local geometry',scene);
  vertexData.applyToMesh(mesh);
  mesh.metadata={count,minGap,minHeight,maxHeight,triangles:indices.length/3,
    contactStoneCount:contacts.length,minimumSeatedGap,aoVertices};
  const material=new PBRMaterial('Muted wet gravel',scene);
  material.metallic=0;material.roughness=.86;material.albedoColor=Color3.White();
  // Test on both sides across the vessel; slope intersections do not expose transparent gaps.
  material.backFaceCulling=false;material.twoSidedLighting=true;
  mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
  return {mesh,contacts};
}

export function installDrainage(scene, earth) {
  if(!earth) return undefined;
  const soil=prepareSoil(earth);
  if(!soil) return undefined;
  const stonesState=stones(scene),gravel=stonesState.mesh;
  const contact=soil.compute(stonesState.contacts);
  gravel.setEnabled(false);
  return {gravel,setEnabled(active) {
    soil.apply(active ? contact : undefined);
    gravel.setEnabled(active);
  }};
}
