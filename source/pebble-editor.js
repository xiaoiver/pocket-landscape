import HavokPhysics from '@babylonjs/havok';
import {Color3, HavokPlugin, Matrix, MeshBuilder, PBRMaterial, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, PointerEventTypes, Ray, Quaternion, Vector3} from '@babylonjs/core';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import {installPebblePour,tapHandful} from './pebble-pour.js';
import {installEditorCursor} from './editor-cursor.js';
import {installEditHistory} from './edit-history.js';
import {createEditorAnimals,maxAnimals} from './editor-animals.js';
import {basePlantNames, createEditorPlants, isPlantTool, maxPlants, readPlants} from './editor-plants.js';
import {createEditorRocks, maxRocks, rockModelNames} from './editor-rocks.js';
import {createEditorMoss} from './editor-moss.js';
import {editFernPath} from './fern-path-preset.js';
import {createPresetMoss} from './preset-moss.js';
import {samplePresetGround} from './preset-ground.js';
import {installPresetLibrary} from './preset-library.js';
import {createSoilInclusions} from './soil-inclusions.js';
import {softenPebbleGloss} from './pebble-material.js';
import {createDrainageGravel} from './drainage.js';
import {blankDrainageLift, createEditorSoil, createSoilCollider} from './editor-soil.js';
import {createLooseSoil} from './loose-soil.js';
import {createDeskSoil} from './desk-soil.js';
import {createEditorVessel} from './editor-vessel.js';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';
import {labelButton,wording} from './interface-language.js';

const blankKey = 'pocket-landscape.pebble-garden.v1';
const maxMounds = 72, maxPatches = 48;
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
function readLayout(storageKey,slope) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      return {
        drainage:saved.drainage, name:saved.name, looseSoil:saved.looseSoil, lamp:saved.lamp, books:saved.books, rocks:saved.rocks, edits:saved.edits, animals:saved.animals, erasedMoss:saved.erasedMoss,
        vessel:Object.hasOwn(vesselWalls,saved.vessel) ? saved.vessel : 'open', sealed:saved.sealed === true,
        plants:readPlants(saved.plants), mounds:readPoints(saved.mounds,maxMounds), patches:readPoints(saved.patches,maxPatches),
        stones:(Array.isArray(saved.stones) ? saved.stones : []).filter(s => tuple(s?.p,3) && Math.hypot(s.p[0],s.p[2])<1.38 &&
          s.p[1]>0 && s.p[1]<(saved.drainage ? 2+blankDrainageLift : 2) && tuple(s.q,4) && tuple(s.r,3) && s.r.every(n=>n>=.004 && n<=.1) &&
          Number.isInteger(s.t) && s.t>=0 && s.t<tones.length),
      };
    }
  } catch { /* Storage may be unavailable when browsing a local file. */ }
  const blank = {vessel:'open',sealed:false,mounds:[],patches:[],plants:[],stones:[]};
  if (!slope) return blank;
  return {...blank,drainage:true,name:wording('卵石坡','Pebble Slope'),
    mounds:[[-.66,-.48],[-.46,-.35],[-.57,-.12],[-.42,.02],[-.62,.18],[-.52,.38],[-.69,.52]],
    patches:[[-.76,-.48],[-.82,-.34],[-.68,.47]],
    rocks:[{scan:'06',x:.44,z:.08,yaw:.35},{scan:'03',x:.65,z:-.23,yaw:-.55}],
  };
}

export async function openPebbleEditor(scene, glass, shadows, loadPlantedModel, desk, {preset,storageKey=blankKey,slope=false}={}) {
  let active = !preset;
  const wasm = Uint8Array.from(atob(document.getElementById('havok-wasm').textContent), c => c.charCodeAt(0));
  const havok = await HavokPhysics({wasmBinary:wasm, locateFile:name => new URL(name,document.baseURI).href});
  scene.enablePhysics(new Vector3(0,-8,0),new HavokPlugin(true,havok));
  scene.getPhysicsEngine().setSubTimeStep(1000/90);
  const layout = readLayout(storageKey,slope);
  const {lamp,books,table} = desk;
  let bookPosition=tuple(layout.books,2) && books.canStandAt(...layout.books) ? layout.books : undefined;
  // Older layouts could leave the lamp where the books now stand by default.
  if (!layout.books && tuple(layout.lamp,2) && !lamp.canStandAt(...layout.lamp,books.home) &&
      lamp.canStandAt(...layout.lamp,[-2.13,-1.95])) bookPosition=[-2.13,-1.95];
  let lampPosition=tuple(layout.lamp,2) && lamp.canStandAt(...layout.lamp,bookPosition ?? books.home) ? layout.lamp : undefined;
  if (!lampPosition && bookPosition && !books.clearsCircle(lamp.position.x,lamp.position.z,.405,...bookPosition)) bookPosition=undefined;
  if (active) {
    books.positionAt(bookPosition);
    lamp.positionAt(lampPosition);
  }
  if (preset && !layout.name) layout.name = wording('蕨间小径','Fern Path');
  const {mounds, patches, stones:saved} = layout;
  const restHeight = preset && samplePresetGround(preset.grounds);
  const originalMoss = preset?.moss && createPresetMoss(preset.moss,layout.erasedMoss);
  let groundHeight = originalMoss && layout.erasedMoss?.length ? samplePresetGround(preset.grounds) : restHeight;
  let bankBody;
  function rebuildBank() {
    bankBody?.dispose();
    const bank = originalMoss.bank;
    bankBody = bank.getTotalIndices() ? createSoilCollider(bank) : null;
    groundHeight = samplePresetGround(preset.grounds);
  }
  const inclusions = preset?.fragmentMaterial && createSoilInclusions(scene,preset.fragmentMaterial);
  const loose=createLooseSoil();
  loose.restore(layout.looseSoil);
  const soil = createEditorSoil(scene,mounds,preset && ((x,z) => groundHeight(x,z)),preset?.grounds[0],inclusions,loose);
  const deskSoil=createDeskSoil(scene,glass,shadows,soil.mesh.material,loose.spilled);
  if (inclusions) {
    glass.addContents?.([inclusions.mesh]);
    shadows.addShadowCaster(inclusions.mesh);
  }
  if (!preset) {
    const {mesh:gravel} = createDrainageGravel(scene);
    softenPebbleGloss(gravel.material);
    shadows.addShadowCaster(gravel);
    glass.addContents?.([gravel]);
    // Legacy blank layouts stored pebble poses in world coordinates.
    if (!layout.drainage) {
      for (const stone of saved) {
        if (stone.support || stone.p[1]<soil.heightAt(stone.p[0],stone.p[2])) stone.p[1]+=blankDrainageLift;
      }
    }
  }
  const heightAt = soil.heightAt;
  const grounds = new Set([soil.mesh,...(preset?.grounds ?? [])]);
  if (preset) {
    for (const ground of preset.grounds) {
      if (ground===originalMoss?.bank && !ground.getTotalIndices()) continue;
      const body = createSoilCollider(ground);
      if (ground===originalMoss?.bank) bankBody=body;
    }
  }

  const moss = createEditorMoss(scene,patches,heightAt);
  glass.addContents?.([soil.mesh,moss.mesh]);
  shadows.addShadowCaster(moss.mesh);
  shadows.addShadowCaster(soil.mesh);
  const vessel = createEditorVessel(scene,glass,shadows,layout.vessel,layout.sealed,lamp,books);
  const [specimens,base] = preset ? [preset.specimens,preset.base] : await Promise.all([
    loadPlantedModel('specimen-data'),loadPlantedModel('model-data',[...rockModelNames,...basePlantNames]),
  ]);
  const foliage = [...specimens,...base.filter(mesh => basePlantNames.includes(mesh.name))];
  const plants = createEditorPlants(scene,foliage,glass,shadows,heightAt,vessel,layout.plants,Boolean(preset));
  const rocks = createEditorRocks({scene,glass,shadows,heightAt,vessel,preset,sources:base,saved:layout.rocks});
  const authored = preset && editFernPath(preset,heightAt,restHeight,layout.edits,vessel);
  const fox = preset?.base.find(mesh => mesh.name.startsWith('Fox ·'));
  const animals = await createEditorAnimals({scene,glass,shadows,loadPlantedModel,fox,heightAt,restHeight,vessel,layout});
  const palette = tones.map(hex => {
    const material = new PBRMaterial('River pebble '+hex,scene);
    material.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    softenPebbleGloss(material);
    material.metallic = 0;
    return material;
  });
  const stones = new Map();
  function attachStone(mesh, seated=false) {
    // Terrain edits and moves can replace the body before the next render.
    mesh.computeWorldMatrix(true);
    const physics = new PhysicsAggregate(mesh,PhysicsShapeType.CONVEX_HULL,{mass:seated ? 0 : .05,friction:slope ? .38 : .85,restitution:0},scene);
    if (!seated) {
      physics.body.setLinearDamping(.5);
      physics.body.setAngularDamping(2);
      physics.body.setCollisionCallbackEnabled(true);
      physics.body.getCollisionObservable().add(({collidedAgainst,point,normal}) => {
        // A side contact with the jar or another falling pebble is not a landing.
        if (point && normal && Math.abs(normal.y)>.25 && point.y<=mesh.position.y+.001 &&
            collidedAgainst.getMotionType()===PhysicsMotionType.STATIC) {
          stones.get(mesh).contact = collidedAgainst;
        }
      });
    }
    return physics;
  }
  function releaseStone(mesh,stone) {
    stone.physics.dispose();
    stone.support = stone.contact = null;
    stone.physics = attachStone(mesh);
  }
  scene.onAfterPhysicsObservable.add(() => {
    for (const [mesh,stone] of stones) {
      if (stone.support?.isDisposed) releaseStone(mesh,stone);
      if (stone.support) continue;
      let support = stone.contact;
      stone.contact = null;
      const {x,y,z} = mesh.position;
      if (slope && y >= heightAt(x,z)-stone.r[1]) {
        // A collision on the hillside is often the start of a roll. Only
        // anchor a pebble after it has slowed down on a supporting body.
        if (!support || stone.physics.body.getLinearVelocity().lengthSquared()>.0036 ||
            stone.physics.body.getAngularVelocity().lengthSquared()>.25) continue;
      }
      // Small chips can cross a thin soil triangle in one physics step.
      // Also recover pebbles already embedded in a restored or reshaped bed.
      if (grounds.has(support?.transformNode) || y<=heightAt(x,z)) {
        const hit = scene.pickWithRay(new Ray(new Vector3(x,2.2,z),Vector3.Down()),
          ground => grounds.has(ground) && ground.isEnabled() && Boolean(ground.physicsBody));
        if (hit?.hit && (grounds.has(support?.transformNode) || y<=hit.pickedPoint.y)) {
          mesh.position.y = hit.pickedPoint.y-.1*stone.r[1];
          support = hit.pickedMesh.physicsBody;
        }
      }
      if (!support || support.isDisposed) continue;
      stone.physics.dispose();
      stone.physics = attachStone(mesh,true);
      stone.support = support;
    }
  });
  function createStone(s) {
    const mesh = MeshBuilder.CreateIcoSphere('Scattered pebble',{radiusX:s.r[0],radiusY:s.r[1],radiusZ:s.r[2],subdivisions:2,flat:false},scene);
    mesh.position.copyFromFloats(...s.p);
    mesh.rotationQuaternion = Quaternion.FromArray(s.q).normalize();
    mesh.material = palette[s.t];
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh);
    glass.addContents?.([mesh]);
    const seated = typeof s.support==='string';
    const physics = attachStone(mesh,seated);
    if (!seated && tuple(s.velocity,3)) physics.body.setLinearVelocity(Vector3.FromArray(s.velocity));
    if (!seated && tuple(s.spin,3)) physics.body.setAngularVelocity(Vector3.FromArray(s.spin));
    stones.set(mesh,{r:s.r,t:s.t,physics,support:null,contact:null});
    return mesh;
  }
  function supportKeys() {
    const keys = new Map();
    for (const body of scene.getPhysicsEngine().getBodies()) {
      if (body.getMotionType()===PhysicsMotionType.STATIC) keys.set(body,body.transformNode.name);
    }
    // Placed animals, rocks and pebbles can share a mesh name. Their order
    // in this snapshot also determines their creation order on restore.
    let i=0;
    for (const mesh of animals.placed.keys()) keys.set(mesh.physicsBody,'animal-'+i++);
    i=0;
    for (const mesh of rocks.placed.keys()) keys.set(mesh.physicsBody,'rock-'+i++);
    i=0;
    for (const stone of stones.values()) keys.set(stone.physics.body,'stone-'+i++);
    return keys;
  }
  function restoreStones(savedStones) {
    const meshes = savedStones.map(createStone);
    const byKey = new Map(Array.from(supportKeys(),([body,key]) => [key,body]));
    meshes.forEach((mesh,i) => {
      const key = savedStones[i].support;
      if (typeof key!=='string') return;
      const stone = stones.get(mesh), support = byKey.get(key);
      if (support && support!==stone.physics.body && support.getMotionType()===PhysicsMotionType.STATIC) stone.support=support;
      else releaseStone(mesh,stone);
    });
  }
  restoreStones(saved);
  const feedback = document.getElementById('editor-feedback');
  let lastSaved = '';
  function snapshot(withMotion=false) {
    const keys = supportKeys();
    const pieces = Array.from(stones, ([mesh,s]) => ({
      p:mesh.position.asArray(),q:mesh.rotationQuaternion.asArray(),r:s.r,t:s.t,support:keys.get(s.support),
      ...(withMotion && !s.support ? {velocity:s.physics.body.getLinearVelocity().asArray(),spin:s.physics.body.getAngularVelocity().asArray()} : {}),
    }));
    return {drainage:preset ? undefined : true,name:layout.name,looseSoil:loose.serialize(),lamp:lampPosition,books:bookPosition,rocks:[...rocks.placed.values()],erasedMoss:originalMoss?.serialize(),animals:[...animals.placed.values()],edits:authored?.serialize(),vessel:vessel.type,sealed:vessel.sealed,mounds,patches,plants:[...plants.planted.values()],stones:pieces};
  }
  const closeSceneMenu = installPresetLibrary(preset || slope ? snapshot : undefined,slope ? 'pebble-slope' : 'fern-path');
  function save() {
    if (!active) return;
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

  function removeStone(mesh) {
    stones.get(mesh).physics.dispose();
    stones.delete(mesh);
    glass.removeContents?.([mesh]);
    shadows.removeShadowCaster(mesh);
    mesh.dispose();
  }
  const capture = () => JSON.stringify(snapshot(true));
  const history = installEditHistory(capture,serialized => {
    select(null);
    const next = JSON.parse(serialized);
    bookPosition=next.books;
    books.positionAt(bookPosition);
    lampPosition=next.lamp;
    lamp.positionAt(lampPosition);
    for (const mesh of stones.keys()) removeStone(mesh);
    const vesselChanged = next.vessel !== vessel.type;
    if (vesselChanged) vessel.setType(next.vessel,next.sealed);
    else if (next.sealed !== vessel.sealed) vessel.setSealed(next.sealed);
    else if (!vessel.sealed) vessel.parkCork();
    const mossCutChanged = originalMoss && JSON.stringify(originalMoss.serialize())!==JSON.stringify(next.erasedMoss);
    if (mossCutChanged) {
      originalMoss.restore(next.erasedMoss);
      rebuildBank();
    }
    const looseChanged=JSON.stringify(loose.serialize())!==JSON.stringify(next.looseSoil);
    if (looseChanged) {
      loose.restore(next.looseSoil);
      deskSoil.sync();
    }
    const groundChanged = looseChanged || mossCutChanged || JSON.stringify(mounds)!==JSON.stringify(next.mounds);
    if (groundChanged) {
      mounds.splice(0,mounds.length,...next.mounds);
      soil.rebuild();
    }
    if (authored) {
      if (groundChanged || JSON.stringify(authored.serialize())!==JSON.stringify(next.edits)) authored.restore(next.edits);
      else if (vesselChanged) authored.fitVessel();
    }
    if (groundChanged || JSON.stringify(patches)!==JSON.stringify(next.patches)) {
      patches.splice(0,patches.length,...next.patches);
      moss.rebuild();
    }
    if (JSON.stringify([...plants.planted.values()])!==JSON.stringify(next.plants)) {
      for (const mesh of plants.planted.keys()) plants.remove(mesh);
      for (const plant of next.plants) plants.add(plant);
    } else if (groundChanged || vesselChanged) plants.settleAll();
    if (JSON.stringify([...animals.placed.values()])!==JSON.stringify(next.animals)) {
      for (const mesh of animals.placed.keys()) animals.remove(mesh);
      for (const animal of next.animals) animals.add(animal);
    } else if (groundChanged || vesselChanged) animals.settleAll();
    if (JSON.stringify([...rocks.placed.values()])!==JSON.stringify(next.rocks)) rocks.restore(next.rocks);
    else if (groundChanged || vesselChanged) rocks.settleAll();
    restoreStones(next.stones);
    reflectVessel();
    save();
  },() => active);
  function commit(before) {
    history.record(before);
    save();
  }
  const corkButton = document.getElementById('cork-toggle');
  const vesselButtons = [...document.querySelectorAll('[data-vessel]')];
  const vesselTrigger = document.getElementById('vessel-trigger'), vesselPanel = document.getElementById('vessel-tools');
  function installPicker(trigger,panel,onOpen) {
    function show(open) {
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded',String(open));
      if (open) {
        onOpen();
        const choice = panel.querySelector('[aria-pressed=true]') || panel.querySelector('button');
        choice.focus({preventScroll:true});
      }
    }
    trigger.addEventListener('click',() => show(panel.hidden));
    function dismissOutside(event) {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) show(false);
    }
    document.addEventListener('pointerdown',dismissOutside);
    document.addEventListener('focusin',dismissOutside);
    document.addEventListener('keydown',event => {
      if (event.key==='Escape' && !panel.hidden) {show(false);trigger.focus();}
    });
    return () => show(false);
  }
  installPicker(vesselTrigger,vesselPanel,() => select(null));
  function reflectVessel() {
    for (const button of vesselButtons) button.setAttribute('aria-pressed',String(button.dataset.vessel === vessel.type));
    const current = vesselButtons.find(button => button.dataset.vessel===vessel.type);
    vesselTrigger.replaceChildren(current.querySelector('svg').cloneNode(true));
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
    const before = capture();
    vessel.setType(button.dataset.vessel);
    authored?.fitVessel();
    plants.settleAll();
    animals.settleAll();
    rocks.settleAll();
    // Stones already falling above the shoulder must fit the newly selected profile.
    for (const [mesh,s] of stones) {
      const p = mesh.position;
      const radius = Math.hypot(p.x,p.z);
      const limit = glassInnerRadiusAt(p.y+.1,vesselWalls[vessel.type]) - Math.max(...s.r)-.015;
      if (radius>limit || (vessel.sealed && p.y>1.88)) {
        const factor = Math.min(1,limit/radius);
        p.x *= factor; p.z *= factor;
        if (vessel.sealed) p.y=Math.min(1.88,p.y);
        releaseStone(mesh,s);
      }
    }
    reflectVessel();
    commit(before);
  });
  corkButton.addEventListener('click',() => {const before=capture();closeCork(!vessel.sealed);commit(before);});
  reflectVessel();
  vesselTrigger.hidden = false;
  function shapeSoil(edit) {
    const previous = new Map([...stones.keys()].map(mesh=>[mesh,heightAt(mesh.position.x,mesh.position.z)]));
    edit();
    soil.rebuild();
    authored?.settleAll();
    moss.rebuild();
    plants.settleAll();
    animals.settleAll();
    rocks.settleAll();
    for (const [mesh,s] of stones) {
      const {x,z} = mesh.position;
      const lift = heightAt(x,z)-previous.get(mesh);
      mesh.position.y = Math.max(mesh.position.y+Math.max(0,lift),heightAt(x,z)+Math.max(...s.r));
      releaseStone(mesh,s);
    }
  }
  function pour(point,count=tapHandful) {
    feedback.textContent = '';
    const before = capture();
    for (let i=0;i<count;i++) {
      const angle = Math.random()*Math.PI*2;
      const spread = .17*Math.sqrt(Math.random());
      let x = point.x+spread*Math.cos(angle), z = point.z+spread*Math.sin(angle);
      const height = Math.min(1.87,Math.max(point.y,heightAt(x,z))+.13+i/count*.344);
      const edge = glassInnerRadiusAt(height+.1,vesselWalls[vessel.type])-.09;
      const clamp = Math.min(1,edge/Math.hypot(x,z));
      x *= clamp; z *= clamp;
      // Sample across the size range in each handful, with more fine gravel.
      const size = .014+.047*((i+Math.random())/count)**1.8;
      const minor = size*(.62+Math.random()*.30);
      createStone({
        p:[x,height,z],
        q:Quaternion.FromEulerAngles(Math.random()*.4,angle,Math.random()*.4).asArray(),
        r:[size,minor*(.56+Math.random()*.25),minor], t:Math.floor(Math.random()*tones.length),
        velocity:[.1*Math.cos(angle),-.28,.1*Math.sin(angle)],spin:[Math.sin(angle)*2,1,Math.cos(angle)*2],
      });
    }
    commit(before);
  }
  let tool = preset ? 'move' : slope ? 'pebbles' : 'soil';
  let selected = null;
  const move = document.querySelector('[data-editor-tool=move]');
  move.hidden = false;
  const ring = document.getElementById('placement-ring');
  scene.onAfterRenderObservable.add(() => {
    if (!selected) return;
    const [x,z] = selected.deskProp ? [selected.deskProp.position.x,selected.deskProp.position.z] : selected.item ? authored.location(selected.item) : [selected.mesh.position.x,selected.mesh.position.z];
    const center = new Vector3(x,selected.deskProp ? (selected.deskProp===books ? books.height : .115) : heightAt(x,z)+.02,z);
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
    choiceRequest++;
    selected = target;
    if (animals.placed.has(target?.mesh)) animalKind = animals.placed.get(target.mesh).kind;
    updateCursor(tool,Boolean(target));
    document.getElementById('animal-turns').hidden = !animals.placed.has(target?.mesh);
    showAnimals(animals.placed.has(target?.mesh));
    ring.hidden = !target;
    move.setAttribute('aria-current',String(Boolean(target)));
    feedback.textContent = '';
    document.getElementById('move-notice').textContent = target?.deskProp ? (target.deskProp===books ? wording('点选桌面放置书摞','Tap the tabletop to place the books') : wording('点选桌面放置台灯','Tap the tabletop to place the lamp')) : target ? wording('点选落点，或按 Delete / Backspace 删除','Tap a destination, or press Delete / Backspace to remove') : '';
  }
  const buttons = [...document.querySelectorAll('[data-editor-tool]')];
  const canvas = scene.getEngine().getRenderingCanvas();
  const cancelPour = installPebblePour(scene,canvas,{
    enabled:() => active && tool==='pebbles',
    pick:(x,y) => scene.pick(x,y,m => m.isEnabled() && (grounds.has(m) || stones.has(m)))?.pickedPoint,
    release:pour,
  });
  if (slope) document.getElementById('pour-hint').textContent = wording(
    '轻点坡面撒 8 颗，长按更多。用手形工具挪开景石再试试。',
    'Tap the slope for 8 pebbles or hold for more. Move a rock and try again.');
  const viewLabel = canvas.getAttribute('aria-label');
  const editLabel = wording('造景台。点选土面使用当前工具，回车在中央使用。','Landscape editor. Tap the soil to use the selected tool, or press Enter at the center.');
  if (active) canvas.setAttribute('aria-label',editLabel);
  const paw = document.getElementById('animal-trigger'), sheet = document.getElementById('animal-sheet');
  const palettes = ['plant','stone'].map(name => {
    const trigger = document.getElementById(name+'-trigger'), panel = document.getElementById(name+'-sheet');
    const choices = [...panel.querySelectorAll('[data-editor-tool]')];
    const label = trigger.getAttribute('aria-label');
    let current = choices[0];
    trigger.replaceChildren(current.querySelector('svg').cloneNode(true));
    const close = installPicker(trigger,panel,() => {select(null);setTool(current.dataset.editorTool);});
    return {panel,close,reflect(tool) {
      const choice = choices.find(button=>button.dataset.editorTool===tool);
      trigger.setAttribute('aria-pressed',String(Boolean(choice)));
      if (choice) {
        current = choice;
        trigger.replaceChildren(choice.querySelector('svg').cloneNode(true));
        labelButton(trigger,label+' · '+choice.getAttribute('aria-label'));
      }
    }};
  });
  const updateCursor = installEditorCursor(scene,canvas,buttons,paw);
  const choices = [...sheet.querySelectorAll('[data-animal]')];
  let choiceRequest = 0;
  let animalKind = 'fox';
  function showAnimals(open) {
    if (open) for (const palette of palettes) palette.close();
    sheet.hidden = !open;
    paw.setAttribute('aria-expanded',String(open));
    for (const choice of choices) choice.setAttribute('aria-pressed',String(choice.dataset.animal===animalKind));
  }
  function reflectPourHint() {
    const show = active && tool==='pebbles';
    document.getElementById('pour-hint').hidden = !show;
    if (show) canvas.setAttribute('aria-describedby','pour-hint');
    else canvas.removeAttribute('aria-describedby');
  }
  function setTool(next) {
    cancelPour();
    tool = next;
    reflectPourHint();
    updateCursor(tool,Boolean(selected));
    for (const button of buttons) button.setAttribute('aria-pressed',String(button.dataset.editorTool===tool));
    for (const palette of palettes) palette.reflect(tool);
    paw.setAttribute('aria-pressed',String(tool==='animal'));
  }
  setTool(tool);
  paw.hidden = false;
  for (const button of buttons) button.addEventListener('click',() => {
    select(null);
    setTool(button.dataset.editorTool);
    const palette = palettes.find(entry=>entry.panel.contains(button));
    if (palette) {
      palette.close();
      canvas.focus({preventScroll:true});
    }
  });
  paw.addEventListener('click',() => {
    const open = sheet.hidden;
    if (open && !animals.placed.has(selected?.mesh)) {
      select(null);
      setTool('animal');
    }
    showAnimals(open);
  });
  for (const choice of choices) choice.addEventListener('click',async () => {
    const kind = choice.dataset.animal;
    const target = selected?.mesh, pose = animals.placed.get(target);
    if (!pose) {
      select(null);
      setTool('animal');
    }
    animalKind = kind;
    showAnimals(false);
    canvas.focus({preventScroll:true});
    const request = ++choiceRequest;
    const loadFailed = wording('加载失败，点选动物重试。','Could not load this figurine. Select it to retry.');
    try {
      await animals.prepare(kind);
    } catch {
      if (request===choiceRequest) {
        if (pose) animalKind=pose.kind;
        showAnimals(true);
        feedback.textContent=loadFailed;
      }
      return;
    }
    if (request!==choiceRequest || !pose || pose.kind===kind) return;
    const before = capture();
    animals.remove(target);
    const mesh = animals.add({kind,x:pose.x,z:pose.z,yaw:pose.yaw});
    select({mesh});
    showAnimals(false);
    commit(before);
  });
  document.addEventListener('pointerdown',event => {
    if (!sheet.hidden && !sheet.contains(event.target) && !paw.contains(event.target)) showAnimals(false);
  });
  document.addEventListener('keydown',event => {
    if (event.key==='Escape' && !sheet.hidden) {showAnimals(false);paw.focus();}
  });
  function rotateAnimal(direction) {
    const pose = animals.placed.get(selected?.mesh);
    if (!pose) return;
    const before = capture();
    pose.yaw += direction*Math.PI/12;
    animals.settle(selected.mesh,pose);
    commit(before);
  }
  function removeObject(item,mesh) {
    if (animals.placed.has(mesh)) animals.remove(mesh);
    else if (item) authored.remove(item);
    else if (rocks.placed.has(mesh)) rocks.remove(mesh);
    else if (plants.planted.has(mesh)) plants.remove(mesh);
    else if (stones.has(mesh)) removeStone(mesh);
    else return false;
    return true;
  }
  document.addEventListener('keydown',event => {
    if (!active || !selected || event.defaultPrevented || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable ||
        event.target.closest?.('input,textarea,select')) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selected.deskProp || event.repeat) return;
      const before = capture();
      if (!removeObject(selected.item,selected.mesh)) return;
      event.preventDefault();
      select(null);
      commit(before);
      return;
    }
    const key = event.key.toLowerCase();
    if (animals.placed.has(selected.mesh) && (key === 'q' || key === 'e')) {
      event.preventDefault();
      rotateAnimal(key === 'q' ? 1 : -1);
    }
  });
  document.getElementById('animal-left').addEventListener('click',() => rotateAnimal(1));
  document.getElementById('animal-right').addEventListener('click',() => rotateAnimal(-1));
  async function apply(point, mesh, item) {
    feedback.textContent = '';
    if (tool === 'move' && !selected) {
      if (lamp.meshes.includes(mesh)) select({deskProp:lamp});
      else if (books.meshes.includes(mesh)) select({deskProp:books});
      else if (item || rocks.placed.has(mesh) || plants.planted.has(mesh) || animals.placed.has(mesh) || stones.has(mesh)) select({item,mesh});
      return;
    }
    if (tool==='animal') {
      const request = choiceRequest;
      // A tap immediately after choosing a thumbnail still places that animal.
      try { await animals.prepare(animalKind); }
      catch {
        if (request===choiceRequest) feedback.textContent=wording('加载失败，点选动物重试。','Could not load this figurine. Select it to retry.');
        return;
      }
      if (!active || request!==choiceRequest || tool!=='animal') return;
    }
    const before = capture();
    if (tool === 'move') {
      if (selected.deskProp) {
        const {x,z}=point;
        const clear = selected.deskProp===books
          ? books.canStandAt(x,z) && books.clearsCircle(lamp.position.x,lamp.position.z,.405,x,z) && vessel.canPlaceBooks(x,z)
          : lamp.canStandAt(x,z) && vessel.canPlaceLamp(x,z);
        if (mesh!==table || !clear) {
          feedback.textContent=wording('请点瓶旁空出的桌面','Tap a clear spot on the tabletop beside the jar.');
          return;
        }
        const position=[x,z];
        if (selected.deskProp===books) bookPosition=position;
        else lampPosition=position;
        selected.deskProp.positionAt(position);
      } else if (selected.item) authored.move(selected.item,point.x,point.z);
      else if (rocks.placed.has(selected.mesh)) {
        const pose = rocks.placed.get(selected.mesh);
        Object.assign(pose,{x:point.x,z:point.z});
        rocks.settle(selected.mesh,pose);
      } else if (animals.placed.has(selected.mesh)) {
        const pose=animals.placed.get(selected.mesh);
        Object.assign(pose,{x:point.x,z:point.z});
        animals.settle(selected.mesh,pose);
      } else if (plants.planted.has(selected.mesh)) {
        Object.assign(plants.planted.get(selected.mesh),{x:point.x,z:point.z});
        plants.settleAll();
      } else {
        const stone = stones.get(selected.mesh);
        const radius = Math.max(...stone.r), limit = 1.30-radius;
        const factor=Math.min(1,limit/Math.hypot(point.x,point.z));
        const x=point.x*factor, z=point.z*factor;
        selected.mesh.position.set(x,heightAt(x,z)+radius,z);
        releaseStone(selected.mesh,stone);
      }
      select(null);
    } else if (tool === 'animal') {
      if (animals.placed.size >= maxAnimals) {
        feedback.textContent = wording('小动物已满，可用橡皮擦移除。','Figurine limit reached. Use the eraser to remove one.');
        return;
      }
      animals.add({kind:animalKind,x:point.x,z:point.z,yaw:0});
    } else if (tool === 'rock') {
      if (rocks.placed.size >= maxRocks) {feedback.textContent = wording('景石已满，可用橡皮擦移除。','Rock limit reached. Use the eraser to remove one.');return;}
      rocks.place(point.x,point.z);
    } else if (tool === 'soil') {
      if (mounds.length+loose.marks.length >= maxMounds) {feedback.textContent = wording('土丘已满，可用橡皮擦移除。','Soil limit reached. Use the eraser to remove a mound.');return;}
      if (vessel.type==='bowl') {
        let overflow;
        shapeSoil(()=>{overflow=loose.add(point.x,point.z,soil.baseHeight);});
        deskSoil.emit(overflow);
      } else shapeSoil(() => mounds.push([point.x,point.z]));
    } else if (isPlantTool(tool)) {
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
    } else if (tool==='erase' && mesh===deskSoil.mesh) {
      deskSoil.erase(point);
    } else if (!removeObject(item,mesh)) {
      const patch = nearestPoint(patches,point,.21);
      if (patch>=0) {
        patches.splice(patch,1);
        moss.rebuild();
      } else if (originalMoss?.layers.includes(mesh)) {
        if (!originalMoss.erase(point)) return;
        shapeSoil(rebuildBank);
      } else {
        const mound = nearestPoint(mounds,point,.48);
        const looseMark=nearestPoint(loose.marks,point,.48);
        const distance=p=>Math.hypot(p[0]-point.x,p[1]-point.z);
        if (looseMark>=0 && (mound<0 || distance(loose.marks[looseMark])<=distance(mounds[mound])))
          shapeSoil(()=>loose.erase(looseMark));
        else if (mound>=0) shapeSoil(()=>mounds.splice(mound,1));
        else return;
      }
    }
    commit(before);
  }
  scene.onPointerObservable.add(() => {
    if (!active || tool==='pebbles') return;
    if (selected?.deskProp) {
      const hit = scene.pick(scene.pointerX,scene.pointerY,m => m.isEnabled() && m.isVisible &&
        (m===table || grounds.has(m) || m.isPickable || lamp.meshes.includes(m) || books.meshes.includes(m)));
      if (hit?.pickedPoint) apply(hit.pickedPoint,hit.pickedMesh);
      return;
    }
    const objects = tool === 'erase' || (tool === 'move' && !selected);
    const planting = tool === 'rock' || isPlantTool(tool) || tool === 'animal';
    const hit = scene.pick(scene.pointerX,scene.pointerY,m => m.isEnabled() && (
      grounds.has(m) || (tool==='erase' && m===deskSoil.mesh) || (tool==='move' && !selected && (lamp.meshes.includes(m) || books.meshes.includes(m))) || (tool==='erase' && originalMoss?.layers.includes(m)) || (!planting && !selected && stones.has(m)) ||
      (objects && (rocks.placed.has(m) || animals.placed.has(m) || (m.isPickable && plants.planted.has(m)) || authored?.pickable(m)))
    ));
    if (hit?.pickedPoint) apply(hit.pickedPoint,hit.pickedMesh,authored?.picked(hit));
  }, PointerEventTypes.POINTERTAP | PointerEventTypes.POINTERDOUBLETAP);
  canvas.addEventListener('keydown',event => {
    if (!active) return;
    if (event.key === 'Escape') {select(null);return;}
    if (event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    if (tool==='pebbles') {pour(new Vector3(0,heightAt(0,0),0));return;}
    const centerPlant = tool === 'erase' && [...plants.planted.keys()].reverse().find(mesh => Math.hypot(mesh.position.x,mesh.position.z)<.12);
    const centerAnimal = (tool==='move' || tool==='erase') && [...animals.placed.keys()].reverse().find(mesh => Math.hypot(mesh.position.x,mesh.position.z)<.35);
    const centerRock = (tool==='move' || tool==='erase') && [...rocks.placed.keys()].reverse().find(mesh => Math.hypot(mesh.position.x,mesh.position.z)<.18);
    const groundAtCenter = tool==='erase' && scene.pickWithRay(
      new Ray(new Vector3(0,3,0),Vector3.Down()),mesh => grounds.has(mesh) && mesh.isEnabled()
    )?.pickedMesh;
    apply(new Vector3(0,heightAt(0,0),0),centerAnimal || centerRock || centerPlant || groundAtCenter || soil.mesh);
  });
  document.getElementById('editor-tools').hidden = false;
  return {setActive(value) {
    if (active && !value) {save();deskSoil.sync();}
    cancelPour();
    active = value;
    closeSceneMenu();
    books.positionAt(value ? bookPosition : undefined);
    lamp.positionAt(value ? lampPosition : undefined);
    if (value && !vessel.sealed) vessel.parkCork();
    select(null);
    for (const palette of palettes) palette.close();
    canvas.setAttribute('aria-label',value ? editLabel : viewLabel);
    reflectPourHint();
    if (!value) canvas.style.removeProperty('--tool-cursor');
  }};
}
