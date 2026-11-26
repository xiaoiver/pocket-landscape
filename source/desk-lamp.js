import {Color3, Light, Mesh, MeshBuilder, PBRMaterial, Quaternion, ShadowGenerator, SpotLight, TransformNode, Vector3} from '@babylonjs/core';

// Spun enamel shade, rolled lip and a brass stem on a weighted foot.
export function createDeskLamp(scene,casement,books) {
  const root = new TransformNode('Reading lamp',scene);
  const home = new Vector3(2.22,0,-.75);
  root.position.copyFrom(home);
  const meshes = [];
  function finish(name,hex,metallic,roughness) {
    const m = new PBRMaterial(name,scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.metallic = metallic;
    m.roughness = roughness;
    return m;
  }
  const enamel = finish('Sage enamel','#687464',.16,.43);
  const brass = finish('Brushed brass','#ab8f60',.62,.42);
  const porcelain = finish('Opal diffuser','#f1dfb9',0,.58);
  function turned(name,profile,material,parent=root) {
    const shape = profile.map(([r,y])=>new Vector3(r,y,0));
    const mesh = MeshBuilder.CreateLathe(name,{shape,tessellation:64,sideOrientation:Mesh.DOUBLESIDE},scene);
    mesh.material=material;
    mesh.parent=parent;
    mesh.isPickable=false;
    meshes.push(mesh);
    return mesh;
  }
  turned('Lamp foot',[[.30,.008],[.39,.014],[.405,.043],[.397,.066],[.35,.099],[.23,.113],[.06,.115],[0,.115]],enamel);
  turned('Lamp stem',[[.077,.11],[.077,.145],[.039,.17],[.030,1.88],[.046,1.90],[.046,1.96],[0,1.97]],brass);
  const neck = MeshBuilder.CreateTube('Lamp neck',{path:[
    new Vector3(0,1.89,0),new Vector3(0,1.98,0),new Vector3(-.015,2.055,.006),
    new Vector3(-.065,2.109,.018),new Vector3(-.16,2.15,.032),new Vector3(-.34,2.19,.06)
  ],radius:.032,tessellation:16},scene);
  neck.parent=root;neck.material=brass;neck.isPickable=false;meshes.push(neck);
  const head = new TransformNode('Tilted lamp head',scene);
  head.parent=root;head.position.set(-.34,2.19,.06);
  const direction = new Vector3(-.72,-.67,.18).normalize();
  head.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Down(),direction,Quaternion.Identity());
  turned('Enamel lamp shade',[[.44,-.37],[.448,-.355],[.43,-.32],[.36,-.19],[.29,-.10],
    [.20,-.035],[.096,.008],[.075,.026],[.075,.070],[.054,.080],[0,.080]],enamel,head);
  turned('Shade brass rim',[[.430,-.37],[.442,-.379],[.452,-.37],[.452,-.357],[.443,-.35]],brass,head);
  turned('Lamp diffuser',[[0,-.388],[.23,-.386],[.36,-.378],[.434,-.364]],porcelain,head);
  const light=new SpotLight('Bedside lamplight',new Vector3(0,-.39,0),Vector3.Down(),2.18,1,scene);
  light.parent=head;
  light.excludedMeshes.push(...casement.meshes);
  light.innerAngle=1.10;light.range=8.5;light.falloffType=Light.FALLOFF_GLTF;
  light.diffuse=new Color3(1,.68,.38);light.specular=new Color3(1,.86,.65);
  light.intensity=25;light.shadowMinZ=.12;light.shadowMaxZ=9;
  const shadows=new ShadowGenerator(1024,light);
  shadows.useContactHardeningShadow=true;shadows.contactHardeningLightSizeUVRatio=.045;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias=.00035;shadows.normalBias=.002;shadows.setDarkness(.25);
  function setLit(on) {
    light.setEnabled(on);
    porcelain.emissiveColor.set(on ? 1 : .025,on ? .76 : .021,on ? .40 : .015);
    enamel.emissiveColor.set(on ? .022 : 0,on ? .021 : 0,on ? .014 : 0);
  }
  setLit(false);
  function canStandAt(x,z,bookPosition) {
    const distance = Math.hypot(x,z);
    if (distance<1.85 || distance>=light.range || casement.distanceFromWall(x,z)<=.55) return false;
    return books.clearsCircle(x,z,.405,...(bookPosition ?? []));
  }
  function positionAt(point) {
    const [x,z] = point ?? [home.x,home.z];
    root.position.set(x,0,z);
    // Keep the shade facing the planting as the lamp moves around the jar.
    root.rotation.y=Math.atan2(x,z)-Math.atan2(home.x,home.z);
    root.computeWorldMatrix(true);
  }
  return {meshes,shadows,setLit,canStandAt,positionAt,position:root.position};
}
