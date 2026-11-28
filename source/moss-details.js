import {Matrix,Mesh,Quaternion,Vector3,VertexData} from '@babylonjs/core';
import {branchletShape} from './moss-branchlets.js';

function capsuleShape() {
  const positions=[], colors=[], indices=[];
  // A curved seta ends in a nodding capsule. Tilt its cross sections with the
  // centerline so the ochre head reads from the side and from above.
  const rings=[
    [0,0,.026,[.07,.052,.016]], [.38,.018,.018,[.17,.084,.025]],
    [.76,.082,.016,[.24,.095,.030]], [.89,.18,.023,[.27,.105,.027]],
    [.92,.22,.050,[.17,.072,.022]], [.94,.30,.071,[.39,.18,.048]],
    [.93,.395,.045,[.46,.24,.069]], [.915,.45,.012,[.24,.112,.032]],
  ];
  for (const [i,[y,z,r,color]] of rings.entries()) {
    const prev=rings[Math.max(0,i-1)], next=rings[Math.min(i+1,rings.length-1)];
    const dy=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dy,dz);
    for (let j=0;j<6;j++) {
      const angle=j*Math.PI/3, side=r*Math.sin(angle);
      positions.push(r*Math.cos(angle),y-side*dz/len,z+side*dy/len);
      colors.push(...color,1);
      if (!i) continue;
      const a=i*6+j,b=i*6+(j+1)%6;
      indices.push(a-6,b,a,b-6,b,a-6);
    }
  }
  return Object.assign(new VertexData(),{positions,colors,indices});
}

export function createMossDetails(scene,material) {
  const at=new Vector3(), scale=new Vector3(), spin=new Quaternion(), matrix=new Matrix();
  function batch(name,data) {
    data.normals=[];
    VertexData.ComputeNormals(data.positions,data.indices,data.normals,{useRightHandedSystem:scene.useRightHandedSystem});
    const mesh=new Mesh(name,scene);
    data.applyToMesh(mesh);
    mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;
    const matrices=[], colors=[];
    return {mesh,
      add(x,y,z,size,yaw,pitch,warmth) {
        at.set(x,y,z);scale.setAll(size);
        Quaternion.RotationYawPitchRollToRef(yaw,pitch,0,spin);
        Matrix.ComposeToRef(scale,spin,at,matrix);
        matrices.push(...matrix.m);
        colors.push(.80+.36*warmth,.94+.10*warmth,.81-.13*warmth,1);
      },
      flush() {
        const transforms=Float32Array.from(matrices), tints=Float32Array.from(colors);
        mesh.setEnabled(transforms.length>0);
        if (transforms.length) {
          mesh.thinInstanceSetBuffer('matrix',transforms,16,true);
          mesh.thinInstanceSetBuffer('color',tints,4,true);
        }
        matrices.length=colors.length=0;
        return {mesh,matrices:transforms,colors:tints};
      }
    };
  }
  const twig=branchletShape();
  twig.colors=[];
  for (let i=1;i<twig.uvs.length;i+=2) {
    const tip=twig.uvs[i];
    twig.colors.push(.033+.22*tip,.083+.28*tip,.020+.068*tip,1);
  }
  return {runners:batch('Moss · creeping fronds',twig),capsules:batch('Moss · ochre capsules',capsuleShape())};
}
