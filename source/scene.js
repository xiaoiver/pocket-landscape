import {localizeInterface, wording} from './interface-language.js';
import {Engine,Scene,ArcRotateCamera,Vector3,Color3,Color4,DirectionalLight,HemisphericLight,ShadowGenerator,MeshBuilder,StandardMaterial,DynamicTexture,Texture,HDRCubeTexture,ImportMeshAsync,SceneLoader} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import {createMorningWindow} from './morning-window.js';
import {createAnimalPlacement} from './animal-placement.js';
import {installGardenControls} from './garden-controls.js';
import {installDepthOfField} from './depth-of-field.js';
import {createMossMist} from './moss-mist.js';
import {installGlass} from './glass.js';
import {installTerrariumLife} from './terrarium-life.js';
import {installDrainage} from './drainage.js';
import {soilInclusions} from './soil-inclusions.js';
import {prepareSubstrate} from './substrate.js';
import {prepareClay,prepareFoliage} from './foliage.js';
import {installMossBranchlets} from './moss-branchlets.js';
import {prepareMossCushions} from './moss-cushions.js';
import {prepareMossPad} from './moss-pad.js';
import {prepareGroundContacts} from './ground-contacts.js';
import {preparePathSoil} from './path-soil.js';
localizeInterface();
const canvas=document.getElementById('garden');
SceneLoader.ShowLoadingScreen = false;
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
  const casement = await createMorningWindow(scene, camera);
  const aim = new Vector3(0,.70,0);
  const ray = aim.subtract(casement.lightEntry).normalize();
  const sky=new HemisphericLight('Window fill',ray.scale(-1),scene);sky.intensity=.78;sky.groundColor=new Color3(.59,.53,.43);
  const sun=new DirectionalLight('Morning window',ray,scene);
  sun.position=aim.subtract(ray.scale(8));sun.intensity=1.55;
  sun.diffuse=new Color3(1,.94,.82);sun.shadowMinZ=.1;sun.shadowMaxZ=15;
  const shadows=new ShadowGenerator(2048,sun);
  shadows.useContactHardeningShadow=true;shadows.contactHardeningLightSizeUVRatio=.075;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;shadows.bias=.0005;shadows.normalBias=.003;
  shadows.setDarkness(.33);sun.shadowFrustumSize=5.3;
  const ground=MeshBuilder.CreateGround('Paper tabletop',{width:350,height:350},scene);ground.receiveShadows=true;
  const floorMat=new StandardMaterial('Warm stone',scene);floorMat.specularColor=Color3.Black();floorMat.disableLighting=false;
  // Leave headroom for the sunlit surface and its PCF shadows.
  floorMat.diffuseColor.setAll(.66);
  const texture=new DynamicTexture('Daylight across the desk',1024,scene,false);
  const ctx=texture.getContext();const img=ctx.createImageData(1024,1024);
  const overcastDesk=ctx.createImageData(1024,1024);
  const daylight = casement.tabletopDaylight(ray);
  for(let i=0;i<1024*1024;i++){
    // The uploaded canvas is flipped in V: its top row faces positive world Z.
    const x=(i%1024-512)*60/1024,z=(512-Math.floor(i/1024))*60/1024;
    const radial=Math.exp(-(x*x/1.3+z*z/.90));
    const shade=(.84+.16*daylight(x,z))*(1-.285*radial);
    img.data.set([222*shade,216*shade,201*shade,255],i*4);
    // Broad window bounce fades toward the near edge of the desk.
    const contact=(1-.21*radial)*(.80+.20*Math.exp(-((x+.7)**2/20+(z+2.6)**2/13)));
    overcastDesk.data.set([211*contact,216*contact,215*contact,255],i*4);
  }
  ctx.putImageData(img,0,0);texture.update();texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;texture.uScale=texture.vScale=350/60;texture.uOffset=texture.vOffset=(1-350/60)/2;floorMat.diffuseTexture=texture;ground.material=floorMat;
  const hdr=new HDRCubeTexture('data:application/octet-stream;base64,'+document.getElementById('studio-data').textContent,scene,64,false,true,false,false);
  scene.environmentTexture=hdr;scene.environmentIntensity=.42;
  async function loadPlantedModel(id) {
    const encoded = document.getElementById(id).textContent.trim();
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const glb = new Uint8Array(await new Response(stream).arrayBuffer());
    const result = await ImportMeshAsync(glb, scene, {pluginExtension: '.glb'});
    const meshes = result.meshes.filter(mesh => mesh.getTotalVertices() > 0);
    for (const mesh of meshes) {
      if (id.startsWith('animal-') || mesh.name.startsWith('Fox ·')) prepareClay(mesh.material);
    }
    return meshes;
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
  }
  for (const mesh of base) {
    if (/^(Original foreground|Original fern|Fern pinnae)/.test(mesh.name)) mesh.setEnabled(false);
  }
  prepareFoliage(scene, [...base.filter(mesh=>mesh.isEnabled()), ...specimens]);
  const query = new URLSearchParams(location.search);
  const forceLightweight = query.get('glass') === 'lightweight' || matchMedia('(pointer: coarse)').matches;
  const layers = Object.fromEntries(['fog','drops','caustic'].map(name => [name,query.get(name) !== '0']));
  const earth=base.find(mesh=>mesh.name==='Earth · planted bank');
  const pathStones=base.filter(mesh=>mesh.name.startsWith('River gravel '));
  const drainage = installDrainage(scene,earth,pathStones[0]?.material);
  if(drainage) shadows.addShadowCaster(drainage.gravel);
  const substrate = drainage && prepareSubstrate(scene,earth,drainage.gravel);
  const contacts=prepareGroundContacts(scene,base);
  const pathSoil=preparePathSoil(scene,earth,pathStones);
  pathSoil?.setEnabled(true);
  pathSoil?.attach(earth?.material);
  if (drainage) {
    const active = query.get('drainage') !== '0';
    drainage.setEnabled(active);
    substrate?.setEnabled(active);
    if (active && substrate) {
      const fragments = soilInclusions(scene,earth);
      if (fragments) { base.push(fragments); shadows.addShadowCaster(fragments); }
    }
    contacts.attach(earth.material);
    pathSoil?.attach(earth.material);
  }
  const rosettes = base.find(mesh => mesh.name === 'Living moss · rosettes');
  const bank = base.find(mesh => mesh.name === 'Cushion moss · continuous bank');
  const shoots = prepareMossCushions(scene, bank, rosettes, {
    lightweight: forceLightweight, settled: drainage?.gravel.isEnabled(),
  });
  if (shoots) { base.push(shoots); shadows.addShadowCaster(shoots); }
  const hasModelledMoss = Boolean(rosettes);
  const mossPad=!hasModelledMoss && prepareMossPad(scene,earth,base);
  if(mossPad)mossPad.setEnabled(true);
  const mossBranchlets=!hasModelledMoss && !mossPad && installMossBranchlets(scene,
    base.filter(mesh=>mesh.name.startsWith('Cushion moss ')),
    pathStones,sun);
  const glass = installGlass(scene, camera, hdr, [ground, ...casement.meshes, ...base, ...specimens, ...(drainage ? [drainage.gravel] : []), ...(mossBranchlets ? [mossBranchlets] : []), ...(mossPad?.meshes ?? [])], {
    forceLightweight, sunlight:sun, layers, animateDrops:!matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  const mist = createMossMist(scene, !glass.highQuality);
  mist.mesh.setEnabled(query.get('mist') !== '0');
  glass.addContents?.([mist.mesh]);
  const life = installTerrariumLife(scene, camera, [...base, ...specimens, ...(mossPad?.meshes ?? [])], glass, {
    enabled: query.get('life') !== '0',
  });
  let fittedRadius;
  function resize() {
    engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,2));
    engine.resize();
    glass.resize?.();
    camera.upperRadiusLimit=Math.max(17,fit()*1.35);
    const nextFit = fit();
    if (fittedRadius === undefined || Math.abs(camera.radius - fittedRadius) < 0.001) camera.radius = nextFit;
    fittedRadius = nextFit;
  }
  resize();
  const fox = base.find(mesh => mesh.name.startsWith('Fox ·'));
  const surfaces = new Set(base.filter(m => m === earth || /^(Cushion moss |River gravel |Woodland outcrop|Weathered granite)/.test(m.name)));
  const placement = createAnimalPlacement(scene,surfaces,contacts);
  placement.activate([fox]);
  installDepthOfField(scene,camera,() => placement.focus);
  window.addEventListener('resize',resize);
  engine.runRenderLoop(()=>{life.update();glass.update();scene.render();});
  await scene.whenReadyAsync();
  function setRain(raining) {
    casement.setRain(raining);
    mist.setRain(raining);
    sun.intensity = raining ? .14 : 1.55;
    if (raining) sun.diffuse.set(.84,.91,1);
    else sun.diffuse.set(1,.94,.82);
    sky.intensity = raining ? .25 : .78;
    if (raining) sky.diffuse.set(.84,.92,.99);
    else sky.diffuse.set(1,1,1);
    scene.environmentIntensity = raining ? .115 : .42;
    if (raining) scene.clearColor.set(.235,.285,.33,1);
    else scene.clearColor.set(.94,.925,.88,1);
    document.body.classList.toggle('rainy', raining);
    shadows.setDarkness(raining ? .74 : .33);
    floorMat.diffuseColor.setAll(raining ? 1 : .66);
    glass.setLayer?.('caustic', !raining && layers.caustic);
    ctx.putImageData(raining ? overcastDesk : img,0,0);
    texture.update();
  }
  installGardenControls({base, loadPlantedModel, shadows, glass, contacts, placement, setRain});
  document.body.classList.add('ready');
}
start().catch(error => {
  console.error(error);
  document.querySelector('.loading-track').hidden = true;
  const message = document.getElementById('loading-message');
  message.textContent = wording('场景加载失败，请使用支持 WebGL 的浏览器重新打开。','The terrarium could not load. Reopen it in a browser that supports WebGL.');
  message.classList.remove('notice');
});
