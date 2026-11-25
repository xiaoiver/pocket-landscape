import HavokPhysics from '@babylonjs/havok';
import {Color3, HavokPlugin, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsShapeType, PointerEventTypes, Quaternion, Vector3} from '@babylonjs/core';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import {createEditorPlants, maxPlants, readPlants} from './editor-plants.js';
import {createEditorMoss} from './editor-moss.js';
import {createEditorSoil, soilLevel} from './editor-soil.js';
import {createEditorVessel} from './editor-vessel.js';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';
import {wording} from './interface-language.js';

const storageKey = 'pocket-landscape.pebble-garden.v1';
const maxStones = 144, maxMounds = 72, maxPatches = 48;
const tones = ['#a5a19a','#70675a','#b59978','#676d69','#c4b5a0','#585955'];
const tuple = (v, length) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
function readPoints(points, limit) {
  return Array.isArray(points) ? points.slice(0,limit).filter(v => tuple(v,2) && Math.hypot(...v)<=1.33) : [];
}
function nearestPoint(points, point, radius) {
  let nearest = -1;
  points.forEach(([x,z],i) => {
    const distance = Math.hypot(x-point.x,z-point.z);
    if (distance <= radius) { nearest = i; radius = distance; }
  });
  return nearest;
}
function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.mounds) && Array.isArray(saved.stones)) {
      return {
        vessel:saved.vessel === 'bottle' ? 'bottle' : 'open', sealed:saved.sealed === true,
        plants:readPlants(saved.plants), mounds:readPoints(saved.mounds,maxMounds), patches:readPoints(saved.patches,maxPatches),
        stones:saved.stones.slice(0,maxStones).filter(s => tuple(s?.p,3) && Math.hypot(s.p[0],s.p[2])<1.38 &&
          s.p[1]>0 && s.p[1]<2 && tuple(s.q,4) && tuple(s.r,3) && s.r.every(n=>n>=.032 && n<=.1) &&
          Number.isInteger(s.t) && s.t>=0 && s.t<tones.length),
      };
    }
  } catch { /* Storage may be unavailable when browsing a local file. */ }
  return {vessel:'open',sealed:false,mounds:[],patches:[],plants:[],stones:[]};
}

export async function openPebbleEditor(scene, glass, shadows, loadPlantedModel) {
  const wasm = Uint8Array.from(atob(document.getElementById('havok-wasm').textContent), c => c.charCodeAt(0));
  const havok = await HavokPhysics({wasmBinary:wasm, locateFile:name => new URL(name,document.baseURI).href});
  scene.enablePhysics(new Vector3(0,-8,0),new HavokPlugin(true,havok));
  scene.getPhysicsEngine().setSubTimeStep(1000/90);
  const layout = readLayout();
  const {mounds, patches, stones:saved} = layout;
  const soil = createEditorSoil(scene,mounds);
  const moss = createEditorMoss(scene,patches,mounds);
  glass.addContents?.([soil.mesh,moss.mesh]);
  shadows.addShadowCaster(moss.mesh);
  shadows.addShadowCaster(soil.mesh);
  const vessel = createEditorVessel(scene,glass,shadows,layout.vessel,layout.sealed);
  const specimens = await loadPlantedModel('specimen-data');
  const plants = createEditorPlants(scene,specimens,glass,shadows,mounds,vessel,layout.plants);
  const palette = tones.map(hex => {
    const material = new PBRMaterial('River pebble '+hex,scene);
    material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    material.roughness = .72;
    material.metallic = 0;
    return material;
  });
  const stones = new Map();
  function attachStone(mesh) {
    const physics = new PhysicsAggregate(mesh,PhysicsShapeType.CONVEX_HULL,{mass:.05, friction:.54, restitution:.16},scene);
    physics.body.setAngularDamping(.2);
    return physics;
  }
  function createStone(s) {
    const mesh = MeshBuilder.CreateIcoSphere('Scattered pebble',{radiusX:s.r[0],radiusY:s.r[1],radiusZ:s.r[2],subdivisions:2,flat:false},scene);
    mesh.position.copyFromFloats(...s.p);
    mesh.rotationQuaternion = Quaternion.FromArray(s.q).normalize();
    mesh.material = palette[s.t];
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    glass.addContents?.([mesh]);
    const physics = attachStone(mesh);
    stones.set(mesh,{r:s.r,t:s.t,physics});
    return physics.body;
  }
  for (const s of saved) createStone(s);
  const feedback = document.getElementById('editor-feedback');
  let lastSaved = '';
  function save() {
    const pieces = Array.from(stones, ([mesh,s]) => ({
      p:mesh.position.asArray(),q:mesh.rotationQuaternion.asArray(),r:s.r,t:s.t,
    }));
    const snapshot = JSON.stringify({vessel:vessel.type,sealed:vessel.sealed,mounds,patches,plants:[...plants.planted.values()],stones:pieces});
    if (snapshot === lastSaved) return;
    try {
      localStorage.setItem(storageKey,snapshot);
      lastSaved = snapshot;
    } catch { feedback.textContent = wording('浏览器无法保存当前布局。','Your browser could not save this layout.'); }
  }
  // Capture the final resting pose even when the user stops interacting after a pour.
  const timer = setInterval(save,1500);
  window.addEventListener('pagehide',save);
  scene.onDisposeObservable.addOnce(() => {clearInterval(timer);window.removeEventListener('pagehide',save);});

  const corkButton = document.getElementById('cork-toggle');
  const vesselButtons = [...document.querySelectorAll('[data-vessel]')];
  function reflectVessel() {
    for (const button of vesselButtons) button.setAttribute('aria-pressed',String(button.dataset.vessel === vessel.type));
    corkButton.hidden = vessel.type !== 'bottle';
    corkButton.setAttribute('aria-pressed',String(vessel.sealed));
  }
  function closeCork(close) {
    vessel.setSealed(close);
    reflectVessel();
  }
  for (const button of vesselButtons) button.addEventListener('click',() => {
    if (button.dataset.vessel === vessel.type) return;
    vessel.setType(button.dataset.vessel);
    plants.settleAll();
    // Stones already falling above the shoulder must fit the newly selected profile.
    for (const [mesh,s] of stones) {
      const p = mesh.position;
      const radius = Math.hypot(p.x,p.z);
      const limit = glassInnerRadiusAt(p.y+.1,vesselWalls[vessel.type]) - Math.max(...s.r)-.015;
      if (radius>limit || (vessel.sealed && p.y>1.88)) {
        s.physics.dispose();
        const factor = Math.min(1,limit/radius);
        p.x *= factor; p.z *= factor;
        if (vessel.sealed) p.y=Math.min(1.88,p.y);
        s.physics=attachStone(mesh);
      }
    }
    reflectVessel();
    save();
  });
  corkButton.addEventListener('click',() => {closeCork(!vessel.sealed);save();});
  reflectVessel();
  document.getElementById('vessel-tools').hidden = false;
  function shapeSoil(edit) {
    const previous = mounds.slice();
    edit();
    soil.rebuild();
    moss.rebuild();
    plants.settleAll();
    for (const [mesh,s] of stones) {
      const {x,z} = mesh.position;
      const lift = soilLevel(mounds,x,z)-soilLevel(previous,x,z);
      s.physics.dispose();
      mesh.position.y += Math.max(0,lift);
      s.physics = attachStone(mesh);
    }
  }
  function pour(point) {
    const count = Math.min(8,maxStones-stones.size);
    for (let i=0;i<count;i++) {
      const angle = Math.random()*Math.PI*2;
      let x = point.x+.12*Math.cos(angle), z = point.z+.12*Math.sin(angle);
      const height = Math.min(1.87,Math.max(point.y,soilLevel(mounds,x,z))+.23+i*.09);
      const edge = glassInnerRadiusAt(height+.1,vesselWalls[vessel.type])-.12;
      const clamp = Math.min(1,edge/Math.hypot(x,z));
      x *= clamp; z *= clamp;
      const size = .052+Math.random()*.022;
      const body = createStone({
        p:[x,height,z],
        q:Quaternion.FromEulerAngles(Math.random()*3,angle,Math.random()*3).asArray(),
        r:[size*1.2,size*(.66+Math.random()*.22),size], t:Math.floor(Math.random()*tones.length),
      });
      body.setLinearVelocity(new Vector3(.19*Math.cos(angle),-.35,.19*Math.sin(angle)));
      body.setAngularVelocity(new Vector3(Math.sin(angle)*4,2,Math.cos(angle)*3));
    }
  }
  let tool = 'soil';
  const buttons = [...document.querySelectorAll('[data-editor-tool]')];
  const canvas = scene.getEngine().getRenderingCanvas();
  canvas.setAttribute('aria-label',wording('造景台。点选土面使用当前工具，回车在中央使用。','Landscape editor. Tap the soil to use the selected tool, or press Enter at the center.'));
  for (const button of buttons) button.addEventListener('click',() => {
    tool = button.dataset.editorTool;
    feedback.textContent = '';
    for (const item of buttons) item.setAttribute('aria-pressed',String(item===button));
  });
  function apply(point, mesh) {
    feedback.textContent = '';
    if (vessel.sealed) closeCork(false);
    if (tool === 'pebbles') {
      if (stones.size >= maxStones) {feedback.textContent = wording('卵石已满，可用橡皮擦移除。','Pebble limit reached. Use the eraser to remove some.');return;}
      pour(point);
    } else if (tool === 'soil') {
      if (mounds.length >= maxMounds) {feedback.textContent = wording('土丘已满，可用橡皮擦移除。','Soil limit reached. Use the eraser to remove a mound.');return;}
      shapeSoil(() => mounds.push([point.x,point.z]));
    } else if (tool === 'fern' || tool === 'fittonia') {
      if (plants.planted.size >= maxPlants) {
        feedback.textContent = wording('植物已满，可用橡皮擦移除。','Plant limit reached. Use the eraser to remove a plant.');
        return;
      }
      plants.add({kind:tool,x:point.x,z:point.z,yaw:Math.random()*2*Math.PI});
    } else if (tool === 'moss') {
      if (patches.length >= maxPatches) {
        feedback.textContent = wording('苔团已满，可用橡皮擦移除。','Moss limit reached. Use the eraser to remove a patch.');
        return;
      }
      patches.push([point.x,point.z]);
      moss.rebuild();
    } else if (plants.planted.has(mesh)) {
      plants.remove(mesh);
    } else if (stones.has(mesh)) {
      stones.delete(mesh);
      glass.removeContents?.([mesh]);
      shadows.removeShadowCaster(mesh);
      mesh.dispose();
    } else {
      const patch = nearestPoint(patches,point,.21);
      if (patch>=0) {
        patches.splice(patch,1);
        moss.rebuild();
      } else {
        const mound = nearestPoint(mounds,point,.48);
        if (mound>=0) shapeSoil(() => mounds.splice(mound,1));
      }
    }
    save();
  }
  scene.onPointerObservable.add(() => {
    const planting = tool === 'fern' || tool === 'fittonia';
    const hit = scene.pick(scene.pointerX,scene.pointerY,m => m === soil.mesh ||
      (!planting && stones.has(m)) || (tool === 'erase' && m.isPickable && plants.planted.has(m)));
    if (hit?.pickedPoint) apply(hit.pickedPoint,hit.pickedMesh);
  }, PointerEventTypes.POINTERTAP | PointerEventTypes.POINTERDOUBLETAP);
  canvas.addEventListener('keydown',event => {
    if (event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    const centerPlant = tool === 'erase' && [...plants.planted.keys()].reverse().find(mesh => Math.hypot(mesh.position.x,mesh.position.z)<.12);
    apply(new Vector3(0,soilLevel(mounds,0,0),0),centerPlant || soil.mesh);
  });
  document.getElementById('editor-tools').hidden = false;
}
