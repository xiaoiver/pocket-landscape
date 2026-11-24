import {MaterialPluginBase, PBRMaterial, RawTexture, Texture, Vector3, VertexBuffer} from '@babylonjs/core';

// Small, world-locked patch. The edge is traced from the existing stone
// triangles, not from the camera or a duplicate drawing of the path.
const S=256, X=-.78, Z=.59, W=1.14, H=.67;
const clamp=(x,a=0,b=1)=>Math.min(Math.max(x,a),b);
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const hash=(x,y,s)=>{let n=Math.imul(x+Math.imul(s,283),374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const fract=x=>x-Math.floor(x);
function coverage(meshes) {
  const hit=new Uint8Array(S*S), p=new Vector3();
  for(const mesh of meshes){
    const pos=mesh.getVerticesData(VertexBuffer.PositionKind),idx=mesh.getIndices();
    if(!pos||!idx) continue;
    const world=mesh.computeWorldMatrix(true),v=new Float32Array(pos.length/3*2);
    for(let j=0;j<pos.length;j+=3){
      p.set(pos[j],pos[j+1],pos[j+2]);
      Vector3.TransformCoordinatesToRef(p,world,p);
      v[j/3*2]=(p.x-X)*S/W;v[j/3*2+1]=(p.z-Z)*S/H;
    }
    for(let i=0;i<idx.length;i+=3){
      const a=idx[i]*2,b=idx[i+1]*2,c=idx[i+2]*2;
      const ax=v[a],az=v[a+1],bx=v[b],bz=v[b+1],cx=v[c],cz=v[c+1];
      const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(S-1,Math.floor(Math.max(ax,bx,cx)));
      const minZ=Math.max(0,Math.floor(Math.min(az,bz,cz))),maxZ=Math.min(S-1,Math.floor(Math.max(az,bz,cz)));
      if(minX>maxX||minZ>maxZ) continue;
      const cross=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
      if(Math.abs(cross)<.00001)continue;
      for(let y=minZ;y<=maxZ;y++)for(let x=minX;x<=maxX;x++){
        const u=x+.5,w=y+.5;
        const e=((bx-ax)*(w-az)-(bz-az)*(u-ax))*cross;
        const f=((cx-bx)*(w-bz)-(cz-bz)*(u-bx))*cross;
        const g=((ax-cx)*(w-cz)-(az-cz)*(u-cx))*cross;
        if(e>=0&&f>=0&&g>=0)hit[y*S+x]=1;
      }
    }
  }
  return hit;
}
function distance(hit,inside) {
  const result=Float32Array.from(hit,n=>n===inside?0:Infinity);
  for(const dir of [1,-1]){
    for(let v=0;v<S;v++)for(let u=0;u<S;u++){
      const x=dir>0?u:S-u-1,z=dir>0?v:S-v-1,i=z*S+x;
      for(const [ox,oz] of [[-1,0],[-1,-1],[0,-1],[1,-1]]){
        const nx=x+dir*ox,nz=z+dir*oz;
        if(nx>=0&&nx<S&&nz>=0&&nz<S) result[i]=Math.min(result[i], result[nz*S+nx]+Math.hypot(ox*W/S,oz*H/S));
      }
    }
  }
  return result;
}
function makeField(scene,stones){
  const hit=coverage(stones);
  if(!hit.some(Boolean))return;
  const toStone=distance(hit,1),toDirt=distance(hit,0),rgba=new Uint8Array(S*S*4);
  for(let row=0;row<S;row++)for(let col=0;col<S;col++){
    const i=row*S+col,x=X+(col+.5)*W/S,z=Z+(row+.5)*H/S;
    const signed=hit[i]?-toDirt[i]:toStone[i];
    const scuff=.78+.14*Math.sin(31*x+17*z)+.08*Math.sin(56*z-44*x);
    const bound=smooth(0,.032,Math.min(x-X,X+W-x,z-Z,Z+H-z,1.297-Math.hypot(x,z)));
    const spread=(1-smooth(-.028,.075,signed))*smooth(-.148,-.062,signed)*bound*scuff;
    // Granular relief in scene units: compacted dirt below, peaked small
    // grains above. Elliptic grains have dark toes and rounded high spots.
    const cx=x/.023,cz=z/.023;
    let best=0,tone=0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const ix=Math.floor(cx)+ox,iz=Math.floor(cz)+oy;
      const a=hash(ix,iz,3)*Math.PI;
      const dx=cx-(ix+.14+.72*hash(ix,iz,4)),dz=cz-(iz+.14+.72*hash(ix,iz,7));
      const r=Math.hypot((dx*Math.cos(a)+dz*Math.sin(a))*.90,(-dx*Math.sin(a)+dz*Math.cos(a))*1.32);
      const h=(.62+.38*hash(ix,iz,8))*(1-smooth(.05,.55,r));
      if(h>best){best=h;tone=hash(ix,iz,11);}
    }
    const soil=.36+.088*Math.sin(81*x+17*z)*Math.cos(68*z)+.075*Math.sin(39*z-53*x)+.033*hash(col,row,13);
    rgba.set([Math.round(255*spread),Math.round(255*best),Math.round(255*soil),Math.round(255*tone)],i*4);
  }
  const map=RawTexture.CreateRGBATexture(rgba,S,S,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
  map.name='Path edge · local soil and grit height field';map.gammaSpace=false;
  map.wrapU=map.wrapV=Texture.CLAMP_ADDRESSMODE;
  return map;
}
class PathSoil extends MaterialPluginBase {
  constructor(material,map){
    super(material,'Path edge height mixture',216,{PATH_SOIL:false});
    this.map=map;this.active=false;this._enable(true);
  }
  prepareDefines(defs) {defs.PATH_SOIL=true;}
  getSamplers(samplers) {samplers.push('pathSoilField');}
  getUniforms(){
    return {ubo:[{name:'pathSoilActive',size:1,type:'float'}],fragment:'uniform float pathSoilActive;'};
  }
  bindForSubMesh(buffer) {
    buffer.setTexture('pathSoilField',this.map);
    buffer.updateFloat('pathSoilActive',this.active?1:0);
  }
  getCustomCode(stage) {
    if(stage!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        #ifdef PATH_SOIL
        uniform sampler2D pathSoilField;
        vec4 getPathSoil(vec3 p) {
          vec2 uv=(p.xz-vec2(${X},${Z}))/vec2(${W},${H});
          return texture2D(pathSoilField,clamp(uv,0.,1.));
        }
        float pathGrit(vec4 field,float aa) {
          // Population mask offsets the mineral surface. The height
          // comparison wins or loses each grain, not each photo.
          float relative=field.g-field.b-(1.-field.r)*.70;
          return smoothstep(-aa,aa,relative)*smoothstep(.025,.19,field.r);
        }
        #endif
      `,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO:`
        #ifdef PATH_SOIL
        if(pathSoilActive>.5 && vPositionW.y>.4) {
          vec4 field=getPathSoil(vPositionW);
          float aa=clamp(fwidth(field.g-field.b)*.88,.024,.20);
          float grit=pathGrit(field,aa);
          vec3 mineral=mix(vec3(.210,.155,.097),vec3(.315,.244,.157),field.a);
          mineral*=.78+.22*field.g;
          surfaceAlbedo=mix(surfaceAlbedo,mineral,grit*.87);
        }
        #endif
      `,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:`
        #ifdef PATH_SOIL
        if(pathSoilActive>.5 && vPositionW.y>.4) {
          vec4 field=getPathSoil(vPositionW);
          float grit=pathGrit(field,clamp(fwidth(field.g-field.b)*.88,.024,.20));
          metallicRoughness.g=mix(metallicRoughness.g,.90+.055*field.a,grit);
          metallicRoughness.g-=.045*field.r*(1.-grit)*smoothstep(.26,.58,field.b);
        }
        #endif
      `,
    };
  }
}
export function preparePathSoil(scene,earth,stones) {
  if(!(earth?.material instanceof PBRMaterial))return;
  const map=makeField(scene,stones);
  if(!map)return;
  const byMaterial=new Map();
  let enabled=false;
  return {
    attach(material){
      if(!(material instanceof PBRMaterial)||byMaterial.has(material))return;
      const plugin=new PathSoil(material,map);
      plugin.active=enabled;
      material.markAsDirty(PBRMaterial.AllDirtyFlag);
      byMaterial.set(material,plugin);
    },
    setEnabled(active){enabled=active;for(const p of byMaterial.values())p.active=active;},
    map
  };
}
