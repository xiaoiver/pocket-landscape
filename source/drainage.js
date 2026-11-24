import { Color3, Material, Mesh, PBRMaterial, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
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
  [.123,.115,.101],[.203,.178,.147],[.135,.144,.140],
  [.242,.202,.160],[.075,.080,.077],[.161,.138,.110],
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
    transformed.push({i,p,r,a,depth:.116+.041*wiggle(a)});
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
      // Two front-facing seams: soil presses out between stones at one,
      // and retreats behind a few exposed mineral faces at the other.
      const spill=1-smooth(.03,.23,wrapDistance(a,1.78));
      const hollow=1-smooth(.04,.26,wrapDistance(a,1.24));
      const crest=smooth(.082,.13,p.y);
      const y=p.y+crest*(.012*hollow-.022*spill);
      const radius=Math.min(r-depth+collar+(.023+.061*crest)*spill-.04*hollow,glassInnerRadiusAt(y)-.015);
      minGap=Math.min(minGap,glassInnerRadiusAt(y)-radius);
      Vector3.TransformCoordinates(new Vector3(p.x*radius/r,y,p.z*radius/r),inverse).toArray(positions,i);
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

// One subdivision rounds the silhouette while the irregular base vertices retain shoulders.
function roundedStone() {
  const unit=p=>p.map(v=>v/Math.hypot(...p));
  const points=ICO.map(unit), edges=new Map(), faces=[];
  function midpoint(a,b) {
    const key=Math.min(a,b)*12+Math.max(a,b);
    if(!edges.has(key)) {
      edges.set(key,points.length);
      points.push(unit(points[a].map((v,i)=>v+points[b][i])));
    }
    return edges.get(key);
  }
  for(const [a,b,c] of FACES) {
    const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    faces.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
  }
  return {points,faces};
}

function stones(scene, pathMaterial) {
  const random=random01(0xa930573d);
  const range=(a,b)=>a+(b-a)*random();
  const positions=[],colors=[],indices=[],uvs=[],contacts=[];
  const shape=roundedStone();
  let count=0,minGap=Infinity,maxHeight=0,minHeight=Infinity;
  // Drop mixed sizes into two depths. The visible rank sits against the glass;
  // recessed stones appear through its openings. The soil backs both ranks.
  for(const recessed of [true,false]) {
    const bed=[];
    for(let attempt=0;attempt<1700;attempt++) {
      const angle=TAU*random();
      const width=attempt<1200 ? range(.041,.091) : range(.027,.048);
      const height=width*range(.46,.79);
      const depth=width*range(.55,.86);
      let y=MIN_HEIGHT+height;
      for(const other of bed) {
        const span=1.30*wrapDistance(other.a,angle)/(.95*(width+other.width));
        if(span<1) y=Math.max(y,other.y+.93*(height+other.height)*Math.sqrt(1-span*span));
      }
      const ceiling=.221+.079*wiggle(angle)+.016*Math.cos(3*angle);
      if(y+height>ceiling)continue;
      bed.push({a:angle,y,width,height});
      if(!recessed && y+height>ceiling-.03)contacts.push({a:angle});
      const ca=Math.cos(angle),sa=Math.sin(angle);
      const tone=ROCK_TONES[Math.floor(random()*ROCK_TONES.length)];
      const exposed=smooth(.16,.24,y+height)*(1-smooth(.06,.24,wrapDistance(angle,1.24)));
      const mineral=tone.map((c,i)=>c+exposed*[.23,.19,.14][i]);
      const tilt=range(-.33,.33),spin=range(0,TAU),phase=range(0,TAU);
      const grain=range(.79,1.16)*(recessed?.66:1);
      const local=shape.points.map(([u,v,w])=>{
        const x=u*Math.cos(spin)-w*Math.sin(spin),z=u*Math.sin(spin)+w*Math.cos(spin);
        const shoulder=Math.pow(Math.max(Math.abs(x),Math.abs(v),Math.abs(z)),-.31);
        const lump=shoulder*(1+.16*Math.sin(3*x+v+phase)*Math.cos(2*z-v)+.09*x*v);
        const t=width*lump*x,up=height*lump*v;
        return [t*Math.cos(tilt)-up*Math.sin(tilt),t*Math.sin(tilt)+up*Math.cos(tilt),depth*lump*z];
      });
      const low=Math.min(...local.map(p=>p[1]));
      const centerY=Math.max(y,MIN_HEIGHT-low);
      // Seat the whole rock inside the curved heel without flattening its outer face.
      let radius=Infinity;
      for(const [t,up,out] of local) {
        const bound=glassInnerRadiusAt(centerY+up)-CLEARANCE-.003;
        radius=Math.min(radius,Math.sqrt(bound*bound-t*t)-out);
      }
      radius-=recessed?range(.062,.082):range(0,.008);
      const first=positions.length/3;
      for(const [t,up,out] of local) {
        const r=radius+out,sy=centerY+up;
        positions.push(r*ca-t*sa,sy,r*sa+t*ca);
        const light=grain*(.86+.14*up/height+.10*out/depth);
        colors.push(...mineral.map(c=>c*light),1);
        uvs.push((angle*1.30+t)*2.2,(sy+.22*out)*2.2);
        minGap=Math.min(minGap,glassInnerRadiusAt(sy)-Math.hypot(r,t));
        minHeight=Math.min(minHeight,sy);maxHeight=Math.max(maxHeight,sy);
      }
      for(const [a,b,c] of shape.faces)indices.push(first+a,first+c,first+b);
      count++;
    }
  }
  const normals=[];
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:scene.useRightHandedSystem});
  const data=new VertexData();
  Object.assign(data,{positions,indices,normals,colors,uvs});
  const mesh=new Mesh('Drainage gravel · local geometry',scene);
  // Geometry is authored counterclockwise, like the imported glTF pebbles.
  mesh.sideOrientation=Material.CounterClockWiseSideOrientation;
  data.applyToMesh(mesh);
  mesh.metadata={count,minGap,minHeight,maxHeight,triangles:indices.length/3,contactStoneCount:contacts.length};
  const material=new PBRMaterial('Water-worn drainage gravel',scene);
  if(pathMaterial instanceof PBRMaterial) {
    material.albedoTexture=pathMaterial.albedoTexture;
    material.bumpTexture=pathMaterial.bumpTexture;
    material.invertNormalMapX=pathMaterial.invertNormalMapX;
    material.invertNormalMapY=pathMaterial.invertNormalMapY;
    material.metallicTexture=pathMaterial.metallicTexture;
    material.useRoughnessFromMetallicTextureAlpha=false;
    material.useRoughnessFromMetallicTextureGreen=true;
    material.useMetallnessFromMetallicTextureBlue=true;
  }
  material.metallic=0;material.roughness=.98;material.metallicF0Factor=.65;material.albedoColor=Color3.White();
  mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
  return {mesh,contacts};
}

export function installDrainage(scene, earth, pathMaterial) {
  if(!earth) return undefined;
  const soil=prepareSoil(earth);
  if(!soil) return undefined;
  const stonesState=stones(scene,pathMaterial),gravel=stonesState.mesh;
  const contact=soil.compute(stonesState.contacts);
  gravel.setEnabled(false);
  return {gravel,setEnabled(active) {
    soil.apply(active ? contact : undefined);
    gravel.setEnabled(active);
  }};
}
