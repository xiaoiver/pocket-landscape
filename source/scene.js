import {Engine,Scene,ArcRotateCamera,Vector3,Color3,Color4,DirectionalLight,HemisphericLight,ShadowGenerator,MeshBuilder,Mesh,StandardMaterial,DynamicTexture,Texture,HDRCubeTexture,VertexData,ImportMeshAsync} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import {installGlass} from './glass.js';
const canvas=document.getElementById('garden');
const status=document.getElementById('status');
async function start(){
  const engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  scene.clearColor=new Color4(.94,.925,.88,1);
  const homeAlpha=Math.PI/2+.09,homeBeta=1.30;
  const target=new Vector3(0,1.20,0);
  const camera=new ArcRotateCamera('Desk view',homeAlpha,homeBeta,8,target,scene);
  function fit(){return window.innerWidth/window.innerHeight<.85?3.38/(2*Math.tan(.17)*engine.getAspectRatio(camera)):10.45;}
  camera.fov=.34;camera.minZ=.05;camera.maxZ=400;camera.lowerBetaLimit=.35;camera.upperBetaLimit=1.48;
  camera.lowerRadiusLimit=2.1;camera.upperRadiusLimit=Math.max(17,fit()*1.3);camera.wheelDeltaPercentage=.014;camera.pinchDeltaPercentage=.009;
  camera.attachControl(canvas,true);camera.panningSensibility=0;canvas.oncontextmenu=e=>e.preventDefault();
  const sky=new HemisphericLight('Window fill',new Vector3(-.3,1,.18),scene);sky.intensity=.78;sky.groundColor=new Color3(.59,.53,.43);
  const sun=new DirectionalLight('Morning window',new Vector3(.82,-1.50,-.70),scene);sun.position=new Vector3(-3,6,3);sun.intensity=1.55;
  sun.diffuse=new Color3(1,.94,.82);sun.shadowMinZ=.1;sun.shadowMaxZ=15;
  const shadows=new ShadowGenerator(2048,sun);
  shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;shadows.bias=.0005;shadows.normalBias=.003;
  shadows.setDarkness(.33);sun.shadowFrustumSize=5.3;
  const ground=MeshBuilder.CreateGround('Paper tabletop',{width:350,height:350},scene);ground.receiveShadows=true;
  const floorMat=new StandardMaterial('Warm stone',scene);floorMat.specularColor=Color3.Black();floorMat.disableLighting=false;
  const texture=new DynamicTexture('Daylight across the desk',1024,scene,false);
  const ctx=texture.getContext();const img=ctx.createImageData(1024,1024);
  for(let i=0;i<1024*1024;i++){
    const x=(i%1024-512)*60/1024,y=(Math.floor(i/1024)-512)*60/1024;
    const radial=Math.exp(-((x-.20)**2/1.3+(y+.09)**2/.90));
    const band=(1+Math.tanh(2.2*Math.sin(.91*x+.47*y+1.3)))*.5;
    const shade=1-.035*band-.285*radial;
    img.data.set([222*shade,216*shade,201*shade,255],i*4);
  }
  ctx.putImageData(img,0,0);texture.update();texture.uScale=texture.vScale=350/60;texture.uOffset=texture.vOffset=(1-350/60)/2;floorMat.diffuseTexture=texture;ground.material=floorMat;
  const hdr=new HDRCubeTexture('data:application/octet-stream;base64,'+document.getElementById('studio-data').textContent,scene,64,false,true,false,false);
  scene.environmentTexture=hdr;scene.environmentIntensity=.42;
  const shadowPlane=new Mesh('Soft silhouette on tabletop',scene);
  const planeData=new VertexData();planeData.positions=[-4,.005,-4,4,.005,-4,4,.005,4,-4,.005,4];
  planeData.indices=[0,2,1,0,3,2];planeData.uvs=[0,0,1,0,1,1,0,1];planeData.applyToMesh(shadowPlane);
  const shadeMat=new StandardMaterial('Translucent window shadow',scene);shadeMat.backFaceCulling=false;shadeMat.disableLighting=true;shadeMat.emissiveColor=Color3.White();
  shadeMat.diffuseTexture=new Texture('data:image/png;base64,'+document.getElementById('shadow-data').textContent,scene,false,false);shadeMat.diffuseTexture.hasAlpha=true;shadeMat.useAlphaFromDiffuseTexture=true;shadowPlane.material=shadeMat;shadowPlane.alphaIndex=0;
  async function loadPlantedModel(id) {
    const encoded = document.getElementById(id).textContent.trim();
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const glb = new Uint8Array(await new Response(stream).arrayBuffer());
    const result = await ImportMeshAsync(glb, scene, {pluginExtension: '.glb'});
    return result.meshes.filter(mesh => mesh.getTotalVertices() > 0);
  }
  const [base, specimens] = await Promise.all([loadPlantedModel('model-data'), loadPlantedModel('specimen-data')]);
  for (const mesh of [...base, ...specimens]) {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    shadows.addShadowCaster(mesh);
    const material = mesh.material;
    if (!material) continue;
    if (mesh.name.includes('scanned sprigs')) {
      material.transparencyMode = 1;
      material.alphaCutOff = .42;
      material.albedoTexture.hasAlpha = true;
    }
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
  }
  const original = base.filter(mesh => /^(Original foreground|Original fern|Fern pinnae)/.test(mesh.name));
  const originalShadow = shadeMat.diffuseTexture;
  const specimenShadow = new Texture('data:image/png;base64,' + document.getElementById('specimen-shadow').textContent, scene, false, false);
  specimenShadow.hasAlpha = true;
  const versions = document.querySelectorAll('[data-planting]');
  function selectPlanting(useSpecimens) {
    original.forEach(mesh => mesh.setEnabled(!useSpecimens));
    specimens.forEach(mesh => mesh.setEnabled(useSpecimens));
    shadeMat.diffuseTexture = useSpecimens ? specimenShadow : originalShadow;
    for (const button of versions) {
      button.setAttribute('aria-pressed', String((button.dataset.planting === 'specimens') === useSpecimens));
    }
  }
  versions.forEach(button => button.onclick = () => selectPlanting(button.dataset.planting === 'specimens'));
  selectPlanting(true);
  const query = new URLSearchParams(location.search);
  const forceLightweight = query.get('glass') === 'lightweight' || matchMedia('(pointer: coarse)').matches;
  const layers = Object.fromEntries(['fog','drops','caustic'].map(name => [name,query.get(name) !== '0']));
  const glass = installGlass(scene, camera, hdr, [ground, shadowPlane, ...base, ...specimens], {
    forceLightweight, sunlight:sun, layers, animateDrops:!matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  if (glass.highQuality) {
    document.querySelector('.glass-options').hidden = false;
    for (const input of document.querySelectorAll('[data-glass-layer]')) {
      const layer = input.dataset.glassLayer;
      input.checked = layers[layer];
      input.addEventListener('change', () => glass.setLayer(layer,input.checked));
    }
  }
  let rotate=false;const spin=document.getElementById('spin');
  function spinning(on){rotate=on;spin.setAttribute('aria-pressed',String(on));spin.querySelector('span').textContent=on?'暂停环绕':'环绕观察';}
  spin.onclick=()=>spinning(!rotate);
  canvas.addEventListener('pointerdown',()=>spinning(false));
  function frame(point,alpha,beta,radius) {
    spinning(false);
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    camera.setTarget(point);
    camera.alpha=alpha;camera.beta=beta;camera.radius=radius;
  }
  function reset(){frame(target.clone(),homeAlpha,homeBeta,fit());}
  function lookAtLeaf(){frame(new Vector3(-.62,1.15,.22),1.90,1.12,fit()*.43);}
  document.getElementById('reset').onclick=reset;
  document.getElementById('detail').onclick=lookAtLeaf;
  function resize(){engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,2));engine.resize();glass.resize?.();camera.upperRadiusLimit=Math.max(17,fit()*1.35);}
  resize();reset();window.addEventListener('resize',()=>{resize();camera.radius=fit();});
  engine.runRenderLoop(()=>{if(rotate)camera.alpha+=Math.min(engine.getDeltaTime(),70)*.00013;glass.update();scene.render();});
  await scene.whenReadyAsync();status.hidden=true;document.body.classList.add('ready');
}
start().catch(error=>{console.error(error);status.textContent='场景加载失败，请使用支持 WebGL 的浏览器重新打开。';});
