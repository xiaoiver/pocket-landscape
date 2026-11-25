import assert from 'node:assert/strict';
import {
  ArcRotateCamera, BaseTexture, MeshBuilder, NullEngine, PBRMaterial, Scene, Vector3, VertexBuffer,
} from '@babylonjs/core';
import {glassInnerRadiusAt, installGlass} from '../source/glass.js';
import {
  MOTE_CEILING, MOTE_FLOOR, MOTE_MARGIN, createMotePool, installTerrariumLife,
  isMossSurface, isSwayFoliage, moteInsideJar, spawnMote, stepMote,
} from '../source/terrarium-life.js';

function randomFrom(seed) {
  return () => {
    seed = Math.imul(seed + 0x6d2b79f5, 1) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

assert.equal(isSwayFoliage('Fern 02 · B'), true);
assert.equal(isSwayFoliage('Pink Angel Fittonia · harenil'), true);
assert.equal(isSwayFoliage('Canopy 0'), true);
assert.equal(isSwayFoliage('Fittonia · ivory'), true);
assert.equal(isSwayFoliage('Petioles'), true);
assert.equal(isSwayFoliage('Fox · Tripo terracotta'), false);
assert.equal(isSwayFoliage('Cushion moss · continuous bank'), false);
assert.equal(isMossSurface('Cushion moss · continuous bank'), true);
assert.equal(isMossSurface('Living moss · rosettes'), true);
assert.equal(isMossSurface('Localized merged moss pad · #4'), true);
assert.equal(isMossSurface('Earth · planted bank'), false);

for (let y = MOTE_FLOOR; y <= MOTE_CEILING; y += 0.05) {
  assert.ok(glassInnerRadiusAt(y) - MOTE_MARGIN > 0.9, `air column at ${y}`);
}

{
  const random = randomFrom(7);
  for (let i = 0; i < 240; i++) {
    const mote = {};
    assert.equal(spawnMote(mote, random), true);
    assert.ok(moteInsideJar(mote));
    for (let step = 0; step < 90; step++) stepMote(mote, 0.16, step * 0.16);
    if (mote.alive) assert.ok(moteInsideJar(mote));
  }
  const escaped = {x: 4, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 20, phase: 0, alive: true};
  stepMote(escaped, 0.016, 1);
  assert.equal(escaped.alive, false);
  const pool = createMotePool(randomFrom(11));
  for (let step = 0; step < 700; step++) pool.step(0.05, step % 180 === 0 ? 1.5 : 1, true);
  const held = pool.motes.find(mote => mote.alive);
  assert.ok(held);
  for (const mote of pool.motes) {
    if (mote.alive) assert.ok(moteInsideJar(mote));
  }
  const frozen = held.y;
  pool.step(1, 2, false);
  assert.equal(held.y, frozen);
}
console.log('Mote paths stay inside the inner glass.');

function garden(lifeOptions) {
  const engine = new NullEngine({renderWidth: 800, renderHeight: 600});
  Object.defineProperty(engine, 'webGLVersion', {value: 2});
  Object.assign(engine.getCaps(), {textureHalfFloatRender: true, textureHalfFloatLinearFiltering: true});
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.environmentIntensity = .42;
  scene.environmentBRDFTexture = new BaseTexture(scene);
  const camera = new ArcRotateCamera('camera', 1.6, 1.2, 8, Vector3.Zero(), scene);
  const fern = MeshBuilder.CreateSphere('Fern 02 · B', {segments: 4, diameter: 0.4}, scene);
  fern.position.set(0.2, 1.2, 0.1);
  fern.material = new PBRMaterial('fern', scene);
  const crown = MeshBuilder.CreateSphere('Fern 02 · C', {segments: 4, diameter: 0.3}, scene);
  crown.position.set(-0.3, 1.1, 0.2);
  crown.material = fern.material;
  const moss = MeshBuilder.CreateGround('Cushion moss · continuous bank', {width: 1.2, height: 1.2}, scene);
  moss.position.y = 0.8;
  moss.material = new PBRMaterial('moss', scene);
  const earth = MeshBuilder.CreateGround('Earth · planted bank', {width: 1.4, height: 1.4}, scene);
  earth.material = new PBRMaterial('earth', scene);
  for (const mesh of [fern, crown, moss, earth]) mesh.isPickable = false;
  const glass = installGlass(scene, camera, new BaseTexture(scene), [earth, moss, fern, crown], {
    layers: {caustic: false}, animateDrops: false,
  });
  const life = installTerrariumLife(scene, camera, [earth, moss, fern, crown], glass, lifeOptions);
  return {engine, scene, fern, crown, moss, earth, glass, life};
}

{
  const {engine, scene, fern, crown, moss, earth, glass, life} = garden();
  const wall = scene.getMeshByName('Clear handblown wall');
  const capture = scene.getMeshByName('Polished foot').material.subSurface.refractionTexture;
  assert.equal(fern.isPickable, true);
  assert.equal(crown.isPickable, true);
  assert.equal(moss.isPickable, false);
  assert.equal(earth.isPickable, false);
  assert.equal(wall.isPickable, false);
  assert.equal(life.motes.isPickable, false);
  assert.equal(life.motes.material.disableDepthWrite, true);
  assert.ok(capture.renderList.includes(life.motes), 'motes are inside the glass capture');
  assert.equal(fern.material.pluginManager.getPlugin('Terrarium sway'), crown.material.pluginManager.getPlugin('Terrarium sway'));
  const sway = fern.material.pluginManager.getPlugin('Terrarium sway');
  assert.match(sway.getCustomCode('vertex').CUSTOM_VERTEX_UPDATE_POSITION, /outward/);
  const mossPlugin = moss.material.pluginManager.getPlugin('Moss surface moisture');
  assert.match(mossPlugin.getCustomCode('fragment').CUSTOM_FRAGMENT_BEFORE_LIGHTS, /lifeMoss|wet/);
  assert.equal(earth.material.pluginManager?.getPlugin('Terrarium sway') ?? null, null);
  assert.equal(earth.material.pluginManager?.getPlugin('Moss surface moisture') ?? null, null);
  const effect = {
    values: {},
    getUniformIndex: () => 0,
    setFloat(name, value) { this.values[name] = value; },
    setFloat4(name, x, y, z, w) { this.values[name] = [x, y, z, w]; },
  };
  sway.hardBindForSubMesh(null, scene, null, {effect, getMesh: () => fern});
  assert.equal(effect.values.lifePlant[0], 1);
  sway.hardBindForSubMesh(null, scene, null, {effect, getMesh: () => earth});
  assert.equal(effect.values.lifePlant[0], 0);
  mossPlugin.hardBindForSubMesh(null, scene, null, {effect, getMesh: () => moss});
  assert.equal(effect.values.lifeMoss[1], 1);
  mossPlugin.hardBindForSubMesh(null, scene, null, {effect, getMesh: () => earth});
  assert.equal(effect.values.lifeMoss[1], 0);
  for (let step = 0; step < 240; step++) life.update(0.05);
  const positions = life.motes.getVerticesData(VertexBuffer.PositionKind);
  const ages = life.motes.getVerticesData(VertexBuffer.UV2Kind);
  let visible = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const mote = {x: positions[vertex * 3], y: positions[vertex * 3 + 1], z: positions[vertex * 3 + 2]};
    assert.ok(moteInsideJar(mote), `vertex ${vertex} left the jar`);
    if (ages[vertex * 2] >= 0) visible++;
  }
  assert.ok(visible > 0 && visible < positions.length / 3);
  scene.dispose();
  engine.dispose();
}
console.log('Sway, moss moisture, glass capture and picking contracts passed.');

{
  const {engine, scene, fern, moss, life} = garden({motion: false});
  assert.equal(life.motes.isEnabled(), false);
  const sway = fern.material.pluginManager.getPlugin('Terrarium sway');
  const effect = {
    values: {},
    getUniformIndex: () => 0,
    setFloat(name, value) { this.values[name] = value; },
    setFloat4(name, x, y, z, w) { this.values[name] = [x, y, z, w]; },
  };
  sway.hardBindForSubMesh(null, scene, null, {effect, getMesh: () => fern});
  assert.equal(effect.values.lifePlant[0], 0);
  moss.material.pluginManager.getPlugin('Moss surface moisture').hardBindForSubMesh(null, scene, null, {effect, getMesh: () => moss});
  assert.equal(effect.values.lifeMoss[1], 0);
  const before = life.motes.getVerticesData(VertexBuffer.PositionKind).slice();
  life.update(1);
  assert.deepEqual(Array.from(life.motes.getVerticesData(VertexBuffer.PositionKind)), Array.from(before));
  scene.dispose();
  engine.dispose();
}
console.log('Reduced motion keeps the terrarium still.');

{
  const {engine, scene, fern, glass, life} = garden({enabled: false});
  assert.equal(life.motes, null);
  assert.equal(fern.isPickable, false);
  assert.equal(fern.material.pluginManager?.getPlugin('Terrarium sway') ?? null, null);
  assert.equal(scene.getMeshByName('Interior motes'), null);
  const capture = scene.getMeshByName('Polished foot').material.subSurface.refractionTexture;
  assert.equal(capture.renderList.some(mesh => mesh.name === 'Interior motes'), false);
  assert.equal(glass.highQuality, true);
  life.update(1);
  scene.dispose();
  engine.dispose();
}
console.log('life=0 leaves the static scene unchanged.');
