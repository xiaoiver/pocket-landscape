import HavokPhysics from '@babylonjs/havok';
import {Color3, HavokPlugin, Matrix, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsShapeType, PointerEventTypes, Quaternion, Vector3} from '@babylonjs/core';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import {createEditorPlants, maxPlants, readPlants} from './editor-plants.js';
import {createEditorMoss} from './editor-moss.js';
import {editFernPath} from './fern-path-preset.js';
import {samplePresetGround} from './preset-ground.js';
import {installPresetLibrary} from './preset-library.js';
import {createEditorSoil} from './editor-soil.js';
import {createEditorVessel} from './editor-vessel.js';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';
import {wording} from './interface-language.js';

const blankKey = 'pocket-landscape.pebble-garden.v1';
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
function readLayout(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      return {
        name:saved.name, edits:saved.edits,
        vessel:saved.vessel === 'bottle' ? 'bottle' : 'open', sealed:saved.sealed === true,
        plants:readPlants(saved.plants), mounds:readPoints(saved.mounds,maxMounds), patches:readPoints(saved.patches,maxPatches),
        stones:(Array.isArray(saved.stones) ? saved.stones : []).slice(0,maxStones).filter(s => tuple(s?.p,3) && Math.hypot(s.p[0],s.p[2])<1.38 &&
          s.p[1]>0 && s.p[1]<2 && tuple(s.q,4) && tuple(s.r,3) && s.r.every(n=>n>=.032 && n<=.1) &&
          Number.isInteger(s.t) && s.t>=0 && s.t<tones.length),
      };
    }
  } catch { /* Storage may be unavailable when browsing a local file. */ }
  return {vessel:'open',sealed:false,mounds:[],patches:[],plants:[],stones:[]};
}

export async function openPebbleEditor(scene, glass, shadows, loadPlantedModel, preset, storageKey=blankKey) {
  const wasm = Uint8Array.from(atob(document.getElementById('havok-wasm').textContent), c => c.charCodeAt(0));
  const havok = await HavokPhysics({wasmBinary:wasm, locateFile:name => new URL(name,document.baseURI).href});
  scene.enablePhysics(new Vector3(0,-8,0),new HavokPlugin(true,havok));
  scene.getPhysicsEngine().setSubTimeStep(1000/90);
  const layout = readLayout(storageKey);
  if (preset && !layout.name) layout.name = wording('蕨间小径','Fern Path');
  const {mounds, patches, stones:saved} = layout;
  const restHeight = preset && samplePresetGround(preset.grounds);
  const soil = createEditorSoil(scene,mounds,restHeight);
  const heightAt = soil.heightAt;
  const grounds = new Set([soil.mesh,...(preset?.grounds ?? [])]);
  if (preset) {
    for (const ground of preset.grounds) {
      new PhysicsAggregate(ground,PhysicsShapeType.MESH,{mass:0,friction:.65,restitution:.09},scene);
    }
  }

  const moss = createEditorMoss(scene,patches,heightAt);
  glass.addContents?.([soil.mesh,moss.mesh]);
  shadows.addShadowCaster(moss.mesh);
  shadows.addShadowCaster(soil.mesh);
  const vessel = createEditorVessel(scene,glass,shadows,layout.vessel,layout.sealed);
  const specimens = preset?.specimens ?? await loadPlantedModel('specimen-data');
  const plants = createEditorPlants(scene,specimens,glass,shadows,heightAt,vessel,layout.plants,Boolean(preset));
  const authored = preset && editFernPath(preset,heightAt,restHeight,layout.edits,vessel);
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
  function snapshot() {
    const pieces = Array.from(stones, ([mesh,s]) => ({
      p:mesh.position.asArray(),q:mesh.rotationQuaternion.asArray(),r:s.r,t:s.t,
    }));
    return {name:layout.name,edits:authored?.serialize(),vessel:vessel.type,sealed:vessel.sealed,mounds,patches,plants:[...plants.planted.values()],stones:pieces};
  }
  if (preset) installPresetLibrary(snapshot);
  function save() {
    const serialized = JSON.stringify(snapshot());
    if (serialized === lastSaved) return;
    try {
      localStorage.setItem(storageKey,serialized);
      lastSaved = serialized;
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
    select(null);
    if (button.dataset.vessel === vessel.type) return;
    vessel.setType(button.dataset.vessel);
    authored?.fitVessel();
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
    authored?.settleAll();
    moss.rebuild();
    plants.settleAll();
    for (const [mesh,s] of stones) {
      const {x,z} = mesh.position;
      const lift = heightAt(x,z)-heightAt(x,z,previous);
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
      const height = Math.min(1.87,Math.max(point.y,heightAt(x,z))+.23+i*.09);
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
  let tool = preset ? 'move' : 'soil';
  let selected = null;
  const move = document.querySelector('[data-editor-tool=move]');
  move.hidden = !preset;
  const ring = document.getElementById('placement-ring');
  if (preset) scene.onAfterRenderObservable.add(() => {
    if (!selected) return;
    const [x,z] = selected.item ? authored.location(selected.item) : [selected.mesh.position.x,selected.mesh.position.z];
    const center = new Vector3(x,heightAt(x,z)+.02,z);
    const engine=scene.getEngine(), camera=scene.activeCamera;
    const view=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
    const screen=Vector3.Project(center,Matrix.IdentityReadOnly,scene.getTransformMatrix(),view);
    const rect=canvas.getBoundingClientRect();
    ring.style.left=(rect.left+screen.x*rect.width/view.width)+'px';
    ring.style.top=(rect.top+screen.y*rect.height/view.height)+'px';
    ring.style.width='28px';
    ring.style.height=Math.max(8,28*Math.abs(Math.cos(camera.beta)))+'px';
  });
  function select(target) {
    selected = target;
    ring.hidden = !target;
    move.setAttribute('aria-current',String(Boolean(target)));
    feedback.textContent = '';
    document.getElementById('move-notice').textContent = target ? wording('点选落点','Tap a destination') : '';
  }
  const buttons = [...document.querySelectorAll('[data-editor-tool]')];
  const canvas = scene.getEngine().getRenderingCanvas();
  canvas.setAttribute('aria-label',wording('造景台。点选土面使用当前工具，回车在中央使用。','Landscape editor. Tap the soil to use the selected tool, or press Enter at the center.'));
  for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset.editorTool===tool));
  for (const button of buttons) button.addEventListener('click',() => {
    select(null);
    tool = button.dataset.editorTool;
    feedback.textContent = '';
    for (const item of buttons) item.setAttribute('aria-pressed',String(item===button));
  });
  function apply(point, mesh, item) {
    feedback.textContent = '';
    if (vessel.sealed) closeCork(false);
    if (tool === 'move') {
      if (!selected) {
        if (item || plants.planted.has(mesh) || stones.has(mesh)) select({item,mesh});
        return;
      }
      if (selected.item) authored.move(selected.item,point.x,point.z);
      else if (plants.planted.has(selected.mesh)) {
        Object.assign(plants.planted.get(selected.mesh),{x:point.x,z:point.z});
        plants.settleAll();
      } else {
        const stone = stones.get(selected.mesh);
        stone.physics.dispose();
        const radius = Math.max(...stone.r), limit = 1.30-radius;
        const factor=Math.min(1,limit/Math.hypot(point.x,point.z));
        const x=point.x*factor, z=point.z*factor;
        selected.mesh.position.set(x,heightAt(x,z)+radius,z);
        stone.physics = attachStone(selected.mesh);
      }
      select(null);
    } else if (tool === 'erase' && item) {
      authored.remove(item);
    } else if (tool === 'pebbles') {
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
    const objects = tool === 'erase' || (tool === 'move' && !selected);
    const planting = tool === 'fern' || tool === 'fittonia';
    const hit = scene.pick(scene.pointerX,scene.pointerY,m => m.isEnabled() && (
      grounds.has(m) || (!planting && !selected && stones.has(m)) ||
      (objects && ((m.isPickable && plants.planted.has(m)) || authored?.pickable(m)))
    ));
    if (hit?.pickedPoint) apply(hit.pickedPoint,hit.pickedMesh,authored?.picked(hit));
  }, PointerEventTypes.POINTERTAP | PointerEventTypes.POINTERDOUBLETAP);
  canvas.addEventListener('keydown',event => {
    if (event.key === 'Escape') {select(null);return;}
    if (event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    const centerPlant = tool === 'erase' && [...plants.planted.keys()].reverse().find(mesh => Math.hypot(mesh.position.x,mesh.position.z)<.12);
    apply(new Vector3(0,heightAt(0,0),0),centerPlant || soil.mesh);
  });
  document.getElementById('editor-tools').hidden = false;
}
