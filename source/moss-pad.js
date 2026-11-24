import {Color3, MaterialPluginBase, Mesh, PBRMaterial, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';

// A small, fixed patch of the original left-hand path edge, in scene units.
const O=[-.79,.55], STEP=.009, W=57, H=59;
const lumps=[[-.576,.638,.135,.078],[-.581,.738,.137,.108],[-.557,.841,.117,.099],
  [-.540,.923,.115,.105],[-.519,.999,.084,.073],[-.672,.797,.071,.123]];
const gaps=[[-.623,.751,.025,.037],[-.503,.843,.038,.018],[-.600,.907,.022,.046],[-.640,.657,.014,.022]];
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function field(x,z){
  let f=0;
  for(const [cx,cz,rx,rz] of lumps){const r2=((x-cx)/rx)**2+((z-cz)/rz)**2;f=Math.max(f,1-r2);}
  for(const [cx,cz,rx,rz] of gaps){const r2=((x-cx)/rx)**2+((z-cz)/rz)**2;f-=1.04*(1-smooth(.15,2.1,r2));}
  f+=.13*Math.sin(64*x+6*z)*Math.sin(58*z-11*x)+.068*Math.sin(98*z+42*x);
  return f;
}

function read(mesh) {
  const pos=mesh.getVerticesData(VertexBuffer.PositionKind);
  const inds=mesh.getIndices();
  const world=mesh.computeWorldMatrix(true);
  if(!pos||!inds)return undefined;
  const points=Array.from({length:pos.length/3},(_,i)=>Vector3.TransformCoordinates(Vector3.FromArray(pos,3*i),world));
  return {mesh,pos,inds,points,uv:mesh.getVerticesData(VertexBuffer.UVKind)};
}
function components(data) {
  const {inds,points}=data;
  const parents=Int32Array.from({length:points.length},(_,i)=>i);
  function find(k){while(k!==parents[k]){parents[k]=parents[parents[k]];k=parents[k];}return k;}
  function union(a,b){const x=find(a),y=find(b);if(x!==y)parents[y]=x;}
  for(let k=0;k<inds.length;k+=3){union(inds[k],inds[k+1]);union(inds[k],inds[k+2]);}
  const groups=new Map();
  for(let n=0;n<points.length;n++){
    const r=find(n),p=points[n],e=groups.get(r)??{vertices:[],triangles:[],avg:new Vector3(),low:new Vector3(Infinity,Infinity,Infinity),high:new Vector3(-Infinity,-Infinity,-Infinity)};
    e.vertices.push(n);e.avg.addInPlace(p);e.low.minimizeInPlace(p);e.high.maximizeInPlace(p);groups.set(r,e);
  }
  for(let k=0;k<inds.length;k+=3)groups.get(find(inds[k])).triangles.push(inds[k],inds[k+1],inds[k+2]);
  for(const e of groups.values())e.avg.scaleInPlace(1/e.vertices.length);
  return [...groups.values()];
}
function gridBounds(points){
  return [Math.floor((Math.min(...points.map(p=>p.x))-O[0])/STEP),Math.floor((Math.max(...points.map(p=>p.x))-O[0])/STEP),
    Math.floor((Math.min(...points.map(p=>p.z))-O[1])/STEP),Math.floor((Math.max(...points.map(p=>p.z))-O[1])/STEP)];
}
function survey(earth,path){
  const cells=Array.from({length:W*H},()=>[]),occupied=new Uint8Array(W*H);
  const put=(data,cb)=>{
    const {points,inds}=data;
    for(let i=0;i<inds.length;i+=3){
      const a=points[inds[i]],b=points[inds[i+1]],c=points[inds[i+2]],tri=[a,b,c];
      const [x0,x1,z0,z1]=gridBounds(tri);
      for(let z=Math.max(0,z0);z<=Math.min(H-1,z1);z++)for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++)cb(z*W+x,tri);
    }
  };
  put(earth,(i,t)=>cells[i].push(t));
  for(const p of path)put(p,i=>occupied[i]=1);
  const at=(x,z)=>[Math.floor((x-O[0])/STEP),Math.floor((z-O[1])/STEP)];
  const survey={floor(x,z) {
    const [i,j]=at(x,z);
    if(i<0||j<0||i>=W||j>=H)return -Infinity;
    let h=-Infinity;
    for(const [a,b,c] of cells[j*W+i]) {
      const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z;
      const det=ux*vz-uz*vx;if(Math.abs(det)<1e-9)continue;
      const u=((x-a.x)*vz-(z-a.z)*vx)/det,v=((z-a.z)*ux-(x-a.x)*uz)/det;
      if(u>=-.00001&&v>=-.00001&&u+v<=1.00001)h=Math.max(h,a.y+u*(b.y-a.y)+v*(c.y-a.y));
    }
    return h;
  }, blocked(points) {
    const [x0,x1,z0,z1]=gridBounds(points);
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(x<0||z<0||x>=W||z>=H||occupied[z*W+x])return true;
    return false;
  }};
  return survey;
}
function lift(x,z,f){
  return .0028+(.012+.006*Math.sin(23*x+12*z)*Math.sin(26*z))*smooth(.11,.68,f)
   +.0035*smooth(.18,.76,f)*(.5+.5*Math.sin(71*x-49*z));
}

class MossPigment extends MaterialPluginBase {
  constructor(material) {
    super(material,'Local moss microtexture',216,{MOSS_PAD_GRAIN:false});this._enable(true);
  }
  prepareDefines(defines){defines.MOSS_PAD_GRAIN=true;}
  getCustomCode(stage){
    return stage==='fragment'?{CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
      #ifdef MOSS_PAD_GRAIN
      vec2 grid=vPositionW.xz*340.;
      vec2 c=floor(grid), q=fract(grid);
      q=q*q*(3.-2.*q);
      float a=fract(sin(dot(c,vec2(127.1,311.7)))*43758.5453);
      float b=fract(sin(dot(c+vec2(1.,0.),vec2(127.1,311.7)))*43758.5453);
      float d=fract(sin(dot(c+vec2(0.,1.),vec2(127.1,311.7)))*43758.5453);
      float e=fract(sin(dot(c+vec2(1.,1.),vec2(127.1,311.7)))*43758.5453);
      float fleck=mix(mix(a,b,q.x),mix(d,e,q.x),q.y);
      surfaceAlbedo*=mix(.73,1.27,fleck);
      surfaceAlbedo+=vec3(.022,.020,.004)*smoothstep(.67,.92,fleck);
      #endif`
    }:null;
  }
}

function meshData(mesh,positions,indices,{colors,uvs}={}){
  const normals=[],data=new VertexData();
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:mesh.getScene().useRightHandedSystem});
  data.positions=positions;data.indices=indices;data.normals=normals;
  if(colors)data.colors=colors;if(uvs)data.uvs=uvs;
  data.applyToMesh(mesh);
  mesh.isPickable=false;mesh.receiveShadows=true;
}

function makePad(scene,terrain){
  const points=[], positions=[],indices=[],colors=[];
  for(let j=0;j<=H;j++)for(let i=0;i<=W;i++){
    const x=O[0]+(i+.006)*STEP,z=O[1]+(j+.006)*STEP,f=field(x,z),floor=terrain.floor(x,z);
    const p=new Vector3(x,Number.isFinite(floor)?floor+lift(x,z,f):0,z);
    points.push({p,valid:Number.isFinite(floor)&&f>.14});positions.push(...p.asArray());
    const w=smooth(.1,.79,f),w2=.5+.5*Math.sin(18*x+26*z)*Math.sin(27*z-3*x);
    colors.push(.063+.044*w+.020*w2,.071+.077*w+.025*w2,.022+.020*w+.010*w2,1);
  }
  const invalid=(i)=>!points[i].valid;
  const add=(a,b,c)=>{
    if([a,b,c].some(invalid)||terrain.blocked([points[a].p,points[b].p,points[c].p]))return;
    indices.push(a,b,c);
  };
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    const a=j*(W+1)+i,b=a+1,c=a+W+1,d=c+1;
    if((i+j)%2){add(a,c,b);add(b,c,d);}else{add(a,c,d);add(a,d,b);}
  }
  if(!indices.length)return undefined;
  const m=new Mesh('Localized merged moss pad · #4',scene);
  meshData(m,positions,indices,{colors});
  const mat=new PBRMaterial('Muted olive moss pad',scene);
  mat.albedoColor=Color3.White();mat.roughness=.95;mat.metallic=0;mat.metallicF0Factor=.55;
  mat.backFaceCulling=false;mat.twoSidedLighting=true;new MossPigment(mat);
  m.material=mat;
  return {m,triangles:indices.length/3};
}

function makeScannedTop(scene,data,terrain,groups){
  const positions=[],uvs=[],indices=[];
  const {points,uv,mesh}=data;if(!uv)return undefined;
  let cards=0;
  for(const g of groups) {
    if(cards>=79||g.vertices.length>12)continue;
    const {avg,low}=g,x=avg.x,z=avg.z,f=field(x,z),floor=terrain.floor(x,z);
    if(f<.52||!Number.isFinite(floor))continue;
    const seed=(g.vertices[0]*16807)%1021/1021;
    if(seed>.40)continue;
    const dir=seed*21+g.avg.z*2.1,dx=Math.cos(dir),dz=Math.sin(dir);
    const h=floor+lift(x,z,f)-.0008;
    const ps=g.vertices.map(i=>{
      const p=points[i],rise=p.y-low.y;
      return new Vector3(x+(p.x-x)*.81+rise*.59*dx,h+rise*.205,z+(p.z-z)*.81+rise*.59*dz);
    });
    if(terrain.blocked(ps))continue;
    const offset=positions.length/3;
    const index=new Map(g.vertices.map((v,i)=>[v,i+offset]));
    for(let j=0;j<ps.length;j++){positions.push(...ps[j].asArray());const i=g.vertices[j];uvs.push(uv[2*i],uv[2*i+1]);}
    indices.push(...g.triangles.map(v=>index.get(v)));cards++;
  }
  if(!indices.length)return undefined;
  const m=new Mesh('Moss pad · reclined real scan tips',scene);
  meshData(m,positions,indices,{uvs});m.material=mesh.material;
  return {m,cards,triangles:indices.length/3};
}

export function prepareMossPad(scene,earth,base){
  const dirt=earth&&read(earth),scanMesh=base.find(m=>m.name==='Living moss · scanned sprigs');
  const scan=scanMesh&&read(scanMesh);if(!dirt||!scan)return undefined;
  const gravel=base.filter(m=>m.name.startsWith('River gravel ')).map(read).filter(Boolean);
  const terrain=survey(dirt,gravel);
  const pad=makePad(scene,terrain);if(!pad)return undefined;
  const changed=[], selected=[];
  const region=(x,z)=>((x+.562)/.252)**2+((z-.804)/.269)**2<1;
  for(const mesh of base.filter(m=>m.name.startsWith('Cushion moss '))){
    const data=read(mesh);if(!data)continue;
    const trimmed=[],groups=components(data);let removed=0;
    for(const g of groups){
      if(region(g.avg.x,g.avg.z))removed++;
      else trimmed.push(...g.triangles);
    }
    if(removed)changed.push({data,trimmed,removed});
  }
  const scanGroups=components(scan),scanTrimmed=[];
  for(const g of scanGroups){
    if(region(g.avg.x,g.avg.z)&&field(g.avg.x,g.avg.z)>.19)selected.push(g);
    else scanTrimmed.push(...g.triangles);
  }
  const tips=makeScannedTop(scene,scan,terrain,selected);
  const meshes=[pad.m,...(tips?[tips.m]:[])];
  for(const m of meshes)m.setEnabled(false);
  let active=false;
  return {meshes,meta:{padTriangles:pad.triangles,cushionPatches:changed.reduce((s,m)=>s+m.removed,0),
    removedScanCards:selected.length,tips:tips?.cards??0,tipsTriangles:tips?.triangles??0,geometryGrid:[W,H],
    removedTriangles:changed.reduce((s,m)=>s+(m.data.inds.length-m.trimmed.length)/3,0)+(scan.inds.length-scanTrimmed.length)/3},
  setEnabled(on){
    if(on===active)return;
    active=on;
    for(const {data,trimmed} of [...changed,{data:scan,trimmed:scanTrimmed}]){
      data.mesh.setIndices(on?trimmed:data.inds,data.pos.length/3);
    }
    for(const m of meshes)m.setEnabled(on);
  }};
}
