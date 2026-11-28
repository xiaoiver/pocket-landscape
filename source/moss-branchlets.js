import {Matrix, Mesh, Quaternion, ShaderMaterial, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';
import '@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration.js';
import '@babylonjs/core/Shaders/ShadersInclude/instancesVertex.js';

const CENTER=[-.52,.81], RADIUS=.29;
const COUNT=288, STEP=.012, PAD=.055, GRID=Math.ceil((2*RADIUS+2*PAD)/STEP);
const X=CENTER[0]-RADIUS-PAD,Z=CENTER[1]-RADIUS-PAD;
function rng(seed) {
  return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
}

function pathMask(meshes) {
  const cells=new Uint8Array(GRID*GRID);
  const mark=(x,z)=>{if(x>=0&&z>=0&&x<GRID&&z<GRID)cells[z*GRID+x]=1;};
  for(const mesh of meshes) {
    const p=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
    if(!p||!indices)continue;
    const world=mesh.computeWorldMatrix(true);
    const points=Array.from({length:p.length/3},(_,i)=>Vector3.TransformCoordinates(Vector3.FromArray(p,i*3),world));
    for(let i=0;i<indices.length;i+=3){
      const tri=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];
      const xs=tri.map(v=>Math.floor((v.x-X)/STEP)),zs=tri.map(v=>Math.floor((v.z-Z)/STEP));
      const x0=Math.max(0,Math.min(...xs)),x1=Math.min(GRID-1,Math.max(...xs));
      const z0=Math.max(0,Math.min(...zs)),z1=Math.min(GRID-1,Math.max(...zs));
      // Occupied triangle AABBs are a deliberately conservative path mask.
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)mark(x,z);
    }
  }
  const point=(x,z)=>{
    const i=Math.floor((x-X)/STEP),j=Math.floor((z-Z)/STEP);
    return i<0||j<0||i>=GRID||j>=GRID||cells[j*GRID+i]===1;
  };
  return {point, bounds(vs) {
    const xs=vs.map(v=>Math.floor((v.x-X)/STEP)),zs=vs.map(v=>Math.floor((v.z-Z)/STEP));
    for(let z=Math.min(...zs);z<=Math.max(...zs);z++)for(let x=Math.min(...xs);x<=Math.max(...xs);x++)
      if(x<0||z<0||x>=GRID||z>=GRID||cells[z*GRID+x])return true;
    return false;
  }};
}

function sampler(meshes, random) {
  const faces=[];let area=0;
  for(const mesh of meshes) {
    const p=mesh.getVerticesData(VertexBuffer.PositionKind), n=mesh.getVerticesData(VertexBuffer.NormalKind),indices=mesh.getIndices();
    if(!p||!n||!indices)continue;
    const world=mesh.computeWorldMatrix(true);
    const points=Array.from({length:p.length/3},(_,i)=>Vector3.TransformCoordinates(Vector3.FromArray(p,i*3),world));
    for(let i=0;i<indices.length;i+=3){
      const k=indices[i],l=indices[i+1],m=indices[i+2];
      const a=points[k],b=points[l],c=points[m];
      if([a,b,c].some(v=>(v.x-CENTER[0])**2+(v.z-CENTER[1])**2>RADIUS**2))continue;
      const normal=Vector3.TransformNormal(Vector3.FromArray(n,k*3).addInPlace(Vector3.FromArray(n,l*3)).addInPlace(Vector3.FromArray(n,m*3)),world).normalize();
      if(normal.y<.76)continue;
      const cross=Vector3.Cross(b.subtract(a),c.subtract(a)).length();
      if(cross<.000003)continue;
      const center=a.add(b).addInPlace(c).scaleInPlace(1/3);
      const feather=(1-((center.x-CENTER[0])**2+(center.z-CENTER[1])**2)/RADIUS**2);
      area+=cross*feather;
      faces.push({a,b,c,normal,area});
    }
  }
  return {faceCount:faces.length,pick() {
    if(!faces.length)return null;
    const key=random()*area;let lo=0,hi=faces.length-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(faces[mid].area>key)hi=mid;else lo=mid+1;}
    const {a,b,c,normal}=faces[lo],u=Math.sqrt(random()),v=random();
    return {p:a.scale(1-u).addInPlace(b.scale(u*(1-v))).addInPlace(c.scale(u*v)),normal};
  }};
}

export function branchletShape() {
  const positions=[],uvs=[],indices=[];
  const leaf=(root,tip,width,pigment,arch=.026)=>{
    const dx=tip[0]-root[0],dz=tip[2]-root[2],mag=Math.hypot(dx,dz);
    const px=-dz/mag*width,pz=dx/mag*width;
    const i=positions.length/3;
    const wing=(t,s)=>[root[0]+dx*t+px*s,root[1]+(tip[1]-root[1])*t,root[2]+dz*t+pz*s];
    const mid=wing(.57,0);mid[1]+=arch;
    positions.push(...root,...wing(.42,1),...mid,...wing(.58,-.77),...tip);
    uvs.push(0,pigment[0],0,pigment[1],1,pigment[1],0,pigment[1],1,pigment[2]);
    indices.push(i,i+1,i+2,i,i+2,i+3,i+2,i+1,i+4,i+2,i+4,i+3);
  };
  // Opposed spreading leaves along a prostrate branch with a forked crown;
  // ridge triangles keep folds readable from the curved-glass view.
  for(const [z,y,w,l,h] of [[.19,.07,.073,.28,.15],[.39,.14,.098,.33,.21],[.63,.24,.087,.28,.27]]){
    leaf([0,y,z],[-l,h,z+.22],w,[.10,z*.64,.69+z*.22]);
    leaf([.014,y+.01,z+.045],[l*.92,h*.87,z+.285],w*.95,[.10,z*.61,.68+z*.23]);
  }
  leaf([0,.22,.57],[-.15,.33,.91],.066,[.27,.58,.92]);
  leaf([.035,.24,.65],[.14,.37,1],.060,[.32,.62,1]);
  // Tapered trace of the short stem (never a vertical blade).
  leaf([0,0,0],[.02,.30,.86],.032,[0,.28,.62],.003);
  const d=new VertexData();d.positions=positions;d.uvs=uvs;d.indices=indices;return d;
}

const vs=`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 viewProjection;
#include<instancesDeclaration>
varying vec2 leaf;
varying vec3 worldPos;
varying float seed;
void main(){
#include<instancesVertex>
  vec4 p=finalWorld*vec4(position,1.);
  vec4 origin=finalWorld*vec4(0.,0.,0.,1.);
  leaf=uv;
  seed=fract(sin(dot(origin.xz,vec2(42.31,91.7)))*42917.4);
  worldPos=p.xyz;
  gl_Position=viewProjection*p;
}`;

const fs=`
precision highp float;
uniform vec3 eye;
uniform vec3 toSun;
uniform float outputLinear;
varying vec2 leaf;
varying vec3 worldPos;
varying float seed;
void main(){
  vec3 n=normalize(cross(dFdx(worldPos),dFdy(worldPos)));
  if(n.y<0.)n=-n;
  vec3 v=normalize(eye-worldPos);
  float lambert=max(0.,dot(n,toSun));
  float back=smoothstep(.0,.95,-dot(v,toSun));
  float t=leaf.y;
  vec3 color=mix(vec3(.145,.183,.072),vec3(.385,.462,.196),smoothstep(.02,.58,t));
  color=mix(color,vec3(.56,.595,.303),.53*smoothstep(.60,1.,t));
  color*= (.83+.28*seed)*(.79+.33*lambert)*(.94+.07*leaf.x);
  // Small solid-leaf back-light cue at tips only; alpha stays opaque.
  color+= vec3(.033,.037,.010)*back*smoothstep(.65,1.,t);
  // Manual pigment values are authored in display space. The curved-glass
  // contents target disables image processing, so it expects scene-linear RGB.
  if(outputLinear>.5)color=pow(color,vec3(2.2));
  gl_FragColor=vec4(color,1.);
}`;

export function installMossBranchlets(scene,mossSurfaces,pathSurfaces,sun) {
  const random=rng(0xe88dd3db);
  const {pick,faceCount}=sampler(mossSurfaces,random);
  if(!faceCount)return undefined;
  const onPath=pathMask(pathSurfaces), nuclei=[];
  for(let i=0;i<800&&nuclei.length<14;i++){
    const {p}=pick();
    if(onPath.point(p.x,p.z)||nuclei.some(n=>Vector3.DistanceSquared(n.p,p)<.058**2))continue;
    nuclei.push({p,radius:.030+.032*random(),density:.46+.55*random()});
  }
  const m=new Mesh('Localized creeping moss · #4',scene), shape=branchletShape();
  shape.applyToMesh(m);
  const pigment=new ShaderMaterial('Creeping moss · roots and thin tips',scene,{vertexSource:vs,fragmentSource:fs},{
    attributes:['position','uv'],uniforms:['world','viewProjection','eye','toSun','outputLinear'],
  },false);
  pigment.backFaceCulling=false;
  const unitSun=new Vector3();
  pigment.onBindObservable.add(()=>{
    const effect=pigment.getEffect();
    sun.direction.negateToRef(unitSun).normalize();
    effect.setVector3('eye',scene.activeCamera.position);
    effect.setFloat('outputLinear',Number(scene.imageProcessingConfiguration.applyByPostProcess));
    effect.setVector3('toSun',unitSun);
  });
  m.material=pigment;m.isPickable=false;
  const values=[], roots=[], activeClusters=new Set(), occupied=new Set();
  let maxUp=0,maxSpan=0,rejectedPath=0;
  for(let attempt=0;attempt<8000&&roots.length<COUNT;attempt++){
    const {p,normal}=pick();
    let influence=0,best=-1;
    for(let i=0;i<nuclei.length;i++){
      const n=nuclei[i],r=Vector3.Distance(p,n.p)/n.radius;
      const w=n.density*Math.max(0,1-r*r);
      if(w>influence){influence=w;best=i;}
    }
    if(random()>influence||best<0)continue;
    const key=Math.floor(p.x/.009)+','+Math.floor(p.z/.009);
    if(occupied.has(key))continue;
    const angle0=2*Math.PI*random(),angle=angle0*.6+best*.67;
    const lean=Vector3.Lerp(Vector3.Up(),normal,.25).normalize();
    const align=Quaternion.FromUnitVectorsToRef(Vector3.Up(),lean,new Quaternion());
    const spin=Quaternion.RotationAxis(Vector3.Up(),angle);
    const stretch=.026+.016*random(), scale=new Vector3(stretch*(.85+.23*random()),.026,stretch);
    // Place the crown shallow; leaflets sit a few millimeters above the source cushion.
    const root=p.clone();root.y-=.0012;
    const t=Matrix.Compose(scale,align.multiply(spin),root);
    let crossing=false,up=0,span=0;const worldPoints=[];
    for(let k=0;k<shape.positions.length;k+=3) {
      const v=Vector3.TransformCoordinates(Vector3.FromArray(shape.positions,k),t);
      worldPoints.push(v);
      if(onPath.point(v.x,v.z)){crossing=true;break;}
      up=Math.max(up,v.y-root.y);span=Math.max(span,Math.hypot(v.x-root.x,v.z-root.z));
    }
    if(!crossing)for(let j=0;j<shape.indices.length;j+=3){
      const tri=shape.indices.slice(j,j+3).map(i=>worldPoints[i]);
      if(onPath.bounds(tri)){crossing=true;break;}
    }
    if(crossing){rejectedPath++;continue;}
    occupied.add(key);activeClusters.add(best);roots.push(root);maxUp=Math.max(maxUp,up);maxSpan=Math.max(maxSpan,span);
    values.push(...t.m);
  }
  if(!roots.length){m.dispose();return undefined;}
  const matrices=Float32Array.from(values);
  m.thinInstanceSetBuffer('matrix',matrices,16,true);
  m.thinInstanceRefreshBoundingInfo(true);
  m.metadata={stems:roots.length,clusters:activeClusters.size,sourceFaces:faceCount,testedVertices:shape.positions.length/3,
    trianglesPerStem:shape.indices.length/3,triangleCount:roots.length*shape.indices.length/3,matrixBytes:matrices.byteLength,
    patchRadius:RADIUS,maxUp,maxSpan,rejectedPath};
  return m;
}
