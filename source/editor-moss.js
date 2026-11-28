import {Matrix,Mesh,PBRMaterial,Quaternion,Texture,Vector3,VertexData} from '@babylonjs/core';
import {createMossDetails} from './moss-details.js';
import {plantedX} from './path-route.js';
import {createMossTuft,colony} from './moss-cushions.js';

const forms = {
  carpet: {radius:.26,depth:.78,lift:.018,shoots:360},
  cushion:{radius:.18,depth:.92,lift:.143,shoots:310},
};

export function readMossPatches(value,limit) {
  // Pairs from older gardens keep the original, unshaped shoot geometry.
  return Array.isArray(value) ? value.slice(0,limit).filter(p=>
    Array.isArray(p) && (p.length===2 || (p.length===3 && typeof p[2]==='string' && Object.hasOwn(forms,p[2]))) &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.hypot(p[0],p[1])<=1.33) : [];
}

function samplePatch(cx,cz,form,t,a) {
  const phase=cx*19+cz*13;
  const cushion=form===forms.cushion;
  const margin=.11*Math.sin(3*a+phase)+.065*Math.cos(5*a-phase)+.04*Math.sin(8*a+phase*.7);
  const size=1+.12*Math.sin(3.17*phase);
  const radius=form.radius*t*(1+margin)*size;
  const u=radius*Math.cos(a), v=radius*Math.sin(a)*form.depth;
  const x=cx+u*Math.cos(phase)-v*Math.sin(phase), z=cz+v*Math.cos(phase)+u*Math.sin(phase);
  const crown=Math.max(0,1-t*t);
  const variation=.5+.5*Math.sin(28*x+phase)*Math.cos(25*z-phase);
  const warm=.5+.5*Math.sin(8*x+2*Math.sin(6*z)+phase*.23);
  // Offset lobes share a skirt, but leave a shallow saddle between crowns.
  const ridge=.68+.32*Math.cos(6*t*Math.cos(a)+phase)*Math.cos(4*t*Math.sin(a)-phase*.36);
  const growth=cushion ? .27+.96*ridge*ridge : .34+.66*variation;
  return {x,z,lift:form.lift*crown*growth*size-.006,light:.62+.20*crown+.20*variation,warm};
}

export function createEditorMoss(scene, patches, heightAt, pathBed) {
  const mesh=createMossTuft(scene);
  const details=createMossDetails(scene,mesh.material);
  const bed=new Mesh('Planted moss · bed',scene);
  const felt=new PBRMaterial('Moss · shaded undergrowth',scene);
  felt.albedoTexture=new Texture('data:image/jpeg;base64,'+document.getElementById('moss-bed').textContent,scene,false,false);
  felt.backFaceCulling=false;
  felt.twoSidedLighting=true;
  felt.roughness=.99;felt.metallic=0;felt.metallicF0Factor=.28;
  bed.material=felt;bed.receiveShadows=true;
  const facePatches=[];
  const fits=(x,z)=>Math.hypot(x,z)<=1.306 && !pathBed?.onPath(x,z);
  const origin = new Vector3(), scale = new Vector3(), spin = new Quaternion(), transform = new Matrix();
  function rebuild() {
    const matrices = [], tints=[], positions=[], indices=[], colors=[], uvs=[];
    facePatches.length=0;
    function shoot(x,z,a,thickness,vertical=thickness,lift=-.005,warm) {
      if (!fits(x,z)) return;
      origin.set(x,heightAt(x,z)+lift,z);
      scale.set(thickness,vertical,thickness);
      Quaternion.RotationYawPitchRollToRef(a,.12*Math.cos(a),.12*Math.sin(a),spin);
      Matrix.ComposeToRef(scale,spin,origin,transform);
      matrices.push(...transform.m);
      if (warm===undefined) tints.push(1,1,1,1);
      else tints.push(.63+.58*warm,.78+.24*warm,.89-.34*warm,1);
    }
    // Continuous ground under the shoots gives the cushion a solid silhouette
    // from the side. Both surfaces follow the same irregular patch footprint.
    function addBed(cx,cz,form,patchIndex) {
      const first=positions.length/3, sides=32, rings=8;
      const visible=[];
      function vertex(t,a) {
        const {x,z,lift,light,warm}=samplePatch(cx,cz,form,t,a);
        positions.push(x,heightAt(x,z)+lift,z);
        uvs.push(x/.46,z/.46);
        visible.push(fits(x,z));
        const tone=light*(.93+.10*Math.sin(92*x)*Math.sin(103*z));
        colors.push((.70+.35*warm)*tone,.88*tone,(.85-.28*warm)*tone,1);
      }
      function face(a,b,c) {
        if (!visible[a] || !visible[b] || !visible[c]) return;
        indices.push(first+a,first+b,first+c);
        facePatches.push(patchIndex);
      }
      vertex(0,0);
      for (let ring=1;ring<=rings;ring++) {
        const start=1+(ring-1)*sides;
        for (let j=0;j<sides;j++) vertex(ring/rings,2*Math.PI*j/sides);
        for (let j=0;j<sides;j++) {
          const a=start+j, b=start+(j+1)%sides;
          if (ring===1) face(0,b,a);
          else {
            face(a-sides,b,a);
            face(a-sides,b-sides,b);
          }
        }
      }
    }
    if (pathBed?.edited()) {
      for (let row=0;row<122;row++) for (let col=-11;col<=11;col++) {
        const a=row*19.3+col*7.9, z=1.29-row*.021+.008*Math.sin(a);
        const offset=col*.021+.008*Math.cos(a);
        if (Math.abs(offset)>.18+.045*z+.02*Math.sin(z*12)) continue;
        const x=plantedX(z)+offset;
        if (!pathBed.erasedAt(x,z)) shoot(x,z,a,.75+.49*colony(x,z)+.24*Math.cos(a));
      }
    }
    for (const [index,[cx,cz,kind]] of patches.entries()) {
      const phase=cx*19+cz*13, form=forms[kind];
      if (form) addBed(cx,cz,form,index);
      if (kind==='cushion' && Math.cos(phase*1.7)>.02) {
        const size=.076+.019*Math.sin(phase);
        for (let k=0;k<4;k++) {
          const p=samplePatch(cx,cz,form,.39+.22*Math.sin(k*5+phase),phase+.64*Math.cos(k*3.8));
          if (fits(p.x,p.z) && Math.hypot(p.x,p.z)<1.26)
            details.capsules.add(p.x,heightAt(p.x,p.z)+p.lift,p.z,size*(1+.21*Math.sin(k*2)),phase+k*2,.10*Math.sin(k+phase),p.warm);
        }
      }
      const count=form?.shoots ?? 270;
      for (let i=0;i<count;i++) {
        const a=i*2.39996+phase, t=Math.sqrt(i/count);
        if (form) {
          const angle=a+.046*Math.sin(17*i+phase);
          const {x,z,lift,warm}=samplePatch(cx,cz,form,t,angle);
          const spread=.9+.36*Math.sin(i*19+phase)+.26*(1-t);
          if (kind==='carpet' && i%3!==0) {
            const yaw=phase+.78*Math.sin(27*x+15*z)+.39*Math.sin(5*i);
            const length=.046+.025*spread;
            const endX=x+length*Math.sin(yaw),endZ=z+length*Math.cos(yaw);
            if (fits(x,z) && fits(endX,endZ)) {
              const pitch=Math.atan2(heightAt(x,z)-heightAt(endX,endZ),length);
              details.runners.add(x,heightAt(x,z)+lift+.003,z,length,yaw,pitch,warm);
            }
          } else {
            shoot(x,z,angle,spread,spread*(kind==='carpet' ? .48 : 1.12),lift-.002,warm);
          }
        } else {
          const r=.19*t*(1+.13*Math.cos(3*a+phase));
          shoot(cx+r*Math.cos(a),cz+r*Math.sin(a),a,1.05+.36*Math.sin(i*19+phase)+.46*(1-r/.21));
        }
      }
    }
    bed.setEnabled(indices.length>0);
    if (indices.length) {
      const normals=[];
      VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:scene.useRightHandedSystem});
      const data=new VertexData();
      Object.assign(data,{positions,indices,normals,colors,uvs});
      data.applyToMesh(bed);
    }
    mesh.setEnabled(matrices.length>0);
    if (matrices.length) {
      mesh.thinInstanceSetBuffer('matrix',Float32Array.from(matrices),16,true);
      mesh.thinInstanceSetBuffer('color',Float32Array.from(tints),4,true);
    }
    details.runners.flush();
    details.capsules.flush();
  }
  rebuild();
  return {meshes:[mesh,bed,details.runners.mesh,details.capsules.mesh],bed,rebuild,patchForFace:face=>facePatches[face]};
}
