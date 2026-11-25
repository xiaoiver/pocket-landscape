import {Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, TransformNode} from '@babylonjs/core';

// Pose each volume on the desk before merging the shared materials.
export function createDeskBooks(scene) {
  const parts = new Map();
  function material(name,hex,roughness) {
    const m = new PBRMaterial(name,scene);
    m.albedoColor=Color3.FromHexString(hex).toLinearSpace();
    m.metallic=0;
    m.roughness=roughness;
    return m;
  }
  const pages=material('Uncoated book paper','#d7cbb3',.95);
  const grain=new DynamicTexture('Cut paper edges',{width:256,height:128},scene,false);
  const ctx=grain.getContext();
  ctx.fillStyle='#f6f1e8';
  ctx.fillRect(0,0,256,128);
  for (let y=1;y<128;y+=3) {
    ctx.fillStyle='rgba(118,104,85,'+(.09+.13*(.5+.5*Math.sin(y*5.7)))+')';
    ctx.fillRect(0,y,256,1);
  }
  grain.update();
  pages.albedoTexture=grain;
  const foil=material('Worn spine tooling','#b8a078',.74);
  const bindings=[
    {width:1.37,depth:.78,thickness:.17,offset:0,yaw:-.045,color:'#70645b'},
    {width:1.23,depth:.68,thickness:.115,offset:-.047,yaw:Math.PI+.09,color:'#955f50'},
    {width:1.13,depth:.65,thickness:.16,offset:.022,yaw:.018,color:'#616f64'},
  ];
  let bottom=0;
  const groups=[];
  for (const [i,book] of bindings.entries()) {
    const group=new TransformNode('Book '+(i+1),scene);
    groups.push(group);
    group.position.set(-2.13+book.offset,bottom,-1.95);
    group.rotation.y=book.yaw+.18;
    const {width,depth,thickness}=book;
    const cloth=material('Cloth binding '+(i+1),book.color,.9);
    function box(w,h,d,x,y,z,finish) {
      const mesh=MeshBuilder.CreateBox('Book detail',{width:w,height:h,depth:d},scene);
      mesh.parent=group;mesh.position.set(x,y,z);
      if (!parts.has(finish)) parts.set(finish,[]);
      parts.get(finish).push(mesh);
      return mesh;
    }
    const board=.015;
    box(width-2*board,thickness-2*board,depth-.038,0,thickness/2,-.003,pages);
    box(width,board,depth,0,board/2,0,cloth);
    box(width,board,depth,0,thickness-board/2,0,cloth);
    const spine=MeshBuilder.CreateCylinder('Rounded cloth spine',{height:width,diameter:1,tessellation:24},scene);
    spine.parent=group;
    spine.rotation.z=Math.PI/2;
    spine.scaling.set(thickness,1,.048);
    spine.position.set(0,thickness/2,depth/2-.019);
    parts.get(cloth).push(spine);
    for (const end of [-1,1]) {
      box(.010,thickness*.60,.008,end*(width/2-.080),thickness/2,depth/2+.002,foil);
    }
    bottom+=thickness;
  }
  const meshes=[];
  for (const [finish,items] of parts) {
    const mesh=Mesh.MergeMeshes(items,true);
    mesh.name='Desk books · '+finish.name;
    mesh.material=finish;mesh.receiveShadows=true;mesh.isPickable=false;
    meshes.push(mesh);
  }
  for (const group of groups) group.dispose();
  return meshes;
}
