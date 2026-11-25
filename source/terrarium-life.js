import {
  Constants, MaterialPluginBase, Mesh, PBRMaterial, PointerEventTypes, RawTexture, ShaderMaterial,
  Texture, Vector3, VertexBuffer, VertexData,
} from '@babylonjs/core';
import {createPlantSway} from './plant-sway.js';
import {enableLeafPicking} from './leaf-picking.js';
import {glassInnerRadiusAt} from './glass.js';

// Air above the moss cushions and below the rolled lip. The wall profile
// already insets the inner glass; motes keep an extra margin so they die
// before they can sit in the refractive shell.
export const MOTE_FLOOR = 1.04;
export const MOTE_CEILING = 1.34;
export const MOTE_MARGIN = 0.05;
const MOTE_CAPACITY = 8;
const MOTE_MAX_ALIVE = 5;

export function isSwayFoliage(name) {
  return /^(Fern |Pink Angel Fittonia|Canopy |Fittonia ·|Petioles|Original foreground|Original fern)/.test(name);
}

export function isMossSurface(name) {
  return /moss/i.test(name);
}

export function moteInsideJar(mote, radiusAt = glassInnerRadiusAt) {
  if (mote.y < MOTE_FLOOR || mote.y > MOTE_CEILING) return false;
  return Math.hypot(mote.x, mote.z) <= radiusAt(mote.y) - MOTE_MARGIN;
}

export function spawnMote(mote, random, radiusAt = glassInnerRadiusAt, ageFraction = 0) {
  const y = MOTE_FLOOR + 0.02 + random() * (MOTE_CEILING - MOTE_FLOOR - 0.08);
  const limit = Math.max(0.05, radiusAt(y) - MOTE_MARGIN);
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * limit * 0.72;
  mote.x = Math.cos(angle) * radius;
  mote.z = Math.sin(angle) * radius;
  mote.y = y;
  mote.life = 6.5 + random() * 5.5;
  const headroom = Math.max(0.01, MOTE_CEILING - y - 0.02);
  mote.vy = Math.min(0.006 + random() * 0.01, headroom / mote.life);
  mote.vx = (random() - 0.5) * 0.004;
  mote.vz = (random() - 0.5) * 0.004;
  mote.age = Math.min(ageFraction, 0.85) * mote.life;
  // Half-extent of the camera-facing quad. About 3–6 px across at the default view.
  mote.size = 0.014 + random() * 0.012;
  mote.phase = random() * Math.PI * 2;
  mote.alive = moteInsideJar(mote, radiusAt);
  return mote.alive;
}

export function stepMote(mote, dt, time, radiusAt = glassInnerRadiusAt) {
  if (!mote.alive) return;
  mote.age += dt;
  const drift = Math.sin(time * 0.42 + mote.phase);
  mote.x += (mote.vx + drift * 0.0025) * dt;
  mote.z += (mote.vz + Math.cos(time * 0.36 + mote.phase * 1.3) * 0.0025) * dt;
  mote.y += mote.vy * dt;
  if (mote.age >= mote.life || !moteInsideJar(mote, radiusAt)) mote.alive = false;
}

export function createMotePool(random = Math.random) {
  const motes = Array.from({length: MOTE_CAPACITY}, () => ({
    x: 0, y: 1.16, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0, phase: 0, alive: false,
  }));
  let accumulator = 0;
  let time = 0;
  let primed = false;
  return {
    motes,
    get time() { return time; },
    step(dt, energy, motion, radiusAt = glassInnerRadiusAt) {
      if (!motion || dt <= 0) return;
      time += dt;
      if (!primed) {
        primed = true;
        for (let i = 0; i < 3; i++) spawnMote(motes[i], random, radiusAt, 0.2 + random() * 0.45);
      }
      for (const mote of motes) stepMote(mote, dt, time, radiusAt);
      const cap = energy > 1.2 ? MOTE_MAX_ALIVE + 2 : MOTE_MAX_ALIVE;
      const interval = 1.85 / Math.max(0.35, energy);
      accumulator += dt;
      while (accumulator >= interval) {
        accumulator -= interval;
        const alive = motes.reduce((count, mote) => count + (mote.alive ? 1 : 0), 0);
        if (alive >= cap) continue;
        const slot = motes.find(mote => !mote.alive);
        if (slot) spawnMote(slot, random, radiusAt, 0);
      }
    },
  };
}

function hashPhase(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
  return (hash % 1000) / 1000 * Math.PI * 2;
}

const MOSS = `
float terrariumWet(vec3 p) {
  float broad = sin(p.x * 3.1 + lifeMoss.x * 0.23) * sin(p.z * 2.5 - lifeMoss.x * 0.17);
  float fine = sin(p.x * 10.5 - lifeMoss.x * 0.31 + p.z * 7.4);
  return clamp(0.5 + 0.42 * broad + 0.16 * fine, 0., 1.) * lifeMoss.y;
}
`;

class MossMoisturePlugin extends MaterialPluginBase {
  constructor(material, state, mossMeshes) {
    super(material, 'Moss surface moisture', 221);
    this._state = state;
    this._mossMeshes = mossMeshes;
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getUniforms() {
    return {externalUniforms: ['lifeMoss']};
  }
  getCustomCode(stage) {
    if (stage !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform vec4 lifeMoss;
        ${MOSS}
      `,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float wet = terrariumWet(vPositionW);
        surfaceAlbedo *= 1. - wet * vec3(0.075, 0.048, 0.086);
      `,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
        float wetRough = terrariumWet(vPositionW);
        metallicRoughness.g = clamp(metallicRoughness.g * (1. - 0.11 * wetRough) - 0.02 * wetRough, 0.28, 1.);
      `,
    };
  }
  hardBindForSubMesh(_uniformBuffer, _scene, _engine, subMesh) {
    const effect = subMesh.effect;
    if (!effect || effect.getUniformIndex('lifeMoss') === -1) return;
    const amount = this._state.motion && this._mossMeshes.has(subMesh.getMesh()) ? 1 : 0;
    effect.setFloat4('lifeMoss', this._state.time, amount, 0, 0);
  }
}

function radiusTexture(scene) {
  const width = 64;
  const pixels = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    const y = (i + 0.5) / width * 1.5;
    pixels[i] = Math.round(255 * Math.min(1, Math.max(0, glassInnerRadiusAt(y) / 1.5)));
  }
  const texture = RawTexture.CreateRTexture(
    pixels, width, 1, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  texture.name = 'Inner glass radius';
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.gammaSpace = false;
  return texture;
}

const MOTE_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 view;
uniform mat4 projection;
varying vec3 vWorld;
varying vec2 vCorner;
varying float vAge;
void main() {
  vWorld = position;
  vCorner = uv;
  vAge = uv2.x;
  vec3 viewCenter = (view * vec4(position, 1.)).xyz;
  gl_Position = projection * vec4(viewCenter + vec3(uv * uv2.y, 0.), 1.);
}
`;

const MOTE_FRAGMENT = `
precision highp float;
uniform sampler2D jarRadius;
varying vec3 vWorld;
varying vec2 vCorner;
varying float vAge;
void main() {
  float limit = texture2D(jarRadius, vec2(clamp(vWorld.y / 1.5, 0., 1.), 0.5)).r * 1.5;
  if (vAge < 0. || vWorld.y < ${MOTE_FLOOR.toFixed(2)} || vWorld.y > ${MOTE_CEILING.toFixed(2)} ||
      length(vWorld.xz) > limit - ${(MOTE_MARGIN * 0.6).toFixed(3)}) discard;
  float disk = 1. - smoothstep(0.12, 0.92, length(vCorner));
  float fade = smoothstep(0., 0.16, vAge) * (1. - smoothstep(0.7, 1., vAge));
  float alpha = disk * fade * 0.62;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(0.93, 0.95, 0.82, alpha);
}
`;

function createMoteMesh(scene, pool) {
  const mesh = new Mesh('Interior motes', scene);
  const positions = new Float32Array(MOTE_CAPACITY * 12);
  const uvs = new Float32Array(MOTE_CAPACITY * 8);
  const uv2 = new Float32Array(MOTE_CAPACITY * 8);
  const indices = [];
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < MOTE_CAPACITY; i++) {
    uvs.set(corners, i * 8);
    const vertex = i * 4;
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    for (let k = 0; k < 4; k++) {
      positions[i * 12 + k * 3 + 1] = 1.16;
      uv2[i * 8 + k * 2] = -1;
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.uvs2 = uv2;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.alphaIndex = 0.6;
  mesh.receiveShadows = false;
  mesh.buildBoundingInfo(new Vector3(-1.4, MOTE_FLOOR, -1.4), new Vector3(1.4, MOTE_CEILING, 1.4));
  const material = new ShaderMaterial('Interior motes', scene, {vertexSource: MOTE_VERTEX, fragmentSource: MOTE_FRAGMENT}, {
    attributes: ['position', 'uv', 'uv2'],
    uniforms: ['view', 'projection'],
    samplers: ['jarRadius'],
    needAlphaBlending: true,
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setTexture('jarRadius', radiusTexture(scene));
  mesh.material = material;
  const positionBuffer = mesh.getVerticesData(VertexBuffer.PositionKind);
  const ageBuffer = mesh.getVerticesData(VertexBuffer.UV2Kind);
  return {
    mesh,
    write() {
      for (let i = 0; i < pool.motes.length; i++) {
        const mote = pool.motes[i];
        const alive = mote.alive;
        const x = alive ? mote.x : 0;
        const y = alive ? mote.y : 1.16;
        const z = alive ? mote.z : 0;
        const age = alive ? mote.age / mote.life : -1;
        const size = alive ? mote.size : 0;
        for (let k = 0; k < 4; k++) {
          const vertex = i * 4 + k;
          positionBuffer[vertex * 3] = x;
          positionBuffer[vertex * 3 + 1] = y;
          positionBuffer[vertex * 3 + 2] = z;
          ageBuffer[vertex * 2] = age;
          ageBuffer[vertex * 2 + 1] = size;
        }
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positionBuffer, false, false);
      mesh.updateVerticesData(VertexBuffer.UV2Kind, ageBuffer, false, false);
    },
  };
}

export function installTerrariumLife(scene, camera, meshes, glass, {enabled = true, motion = true} = {}) {
  if (!enabled) return {update() {}, motes: null};
  const preference = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)');
  const state = {time: 0, motion: false};
  let plantsOn = true, motesOn = true;
  const records = [];
  const byMesh = new Map();
  const atlases = new Map();
  const moist = new Set();
  const mossMeshes = new Set();
  for (const mesh of meshes) {
    if (!mesh?.isEnabled?.() || !(mesh.material instanceof PBRMaterial)) continue;
    if (isSwayFoliage(mesh.name)) {
      const record = {mesh, ...createPlantSway(mesh), phase: hashPhase(mesh.name), hover: 0, pulse: 0, pulseTarget: 0};
      records.push(record);
      byMesh.set(mesh, record);
      enableLeafPicking(mesh, atlases);
    } else if (isMossSurface(mesh.name) && !mesh.name.startsWith('Localized creeping')) {
      mossMeshes.add(mesh);
      if (!moist.has(mesh.material)) {
        moist.add(mesh.material);
        new MossMoisturePlugin(mesh.material, state, mossMeshes);
      }
    }
  }
  const pool = createMotePool();
  const motes = createMoteMesh(scene, pool);
  glass?.addContents?.([motes.mesh]);
  let hovered = null;
  let pickPending = false, cooldown = 0;
  const leave = () => { hovered = null; pickPending = false; };
  const onMove = scene.onPointerObservable.add(info => {
    if (!state.motion || info.event.buttons || info.event.pointerType === 'touch') leave();
    else pickPending = true;
  }, PointerEventTypes.POINTERMOVE | PointerEventTypes.POINTERDOWN);
  const onTap = scene.onPointerObservable.add(info => {
    if (!state.motion) return;
    const record = byMesh.get(info.pickInfo?.pickedMesh);
    if (record) record.pulseTarget = 1;
  }, PointerEventTypes.POINTERTAP);
  const canvas = scene.getEngine().getRenderingCanvas?.();
  canvas?.addEventListener('pointerleave', leave);
  scene.onDisposeObservable.addOnce(() => {
    scene.onPointerObservable.remove(onMove);
    scene.onPointerObservable.remove(onTap);
    canvas?.removeEventListener('pointerleave', leave);
  });
  function syncMotion() {
    const allowed = motion && !preference?.matches;
    state.motion = allowed && plantsOn;
    motes.mesh.setEnabled(allowed && motesOn);
    if (!state.motion) leave();
  }
  syncMotion();
  return {
    motes: motes.mesh,
    get plantsOn() { return plantsOn; },
    get motesOn() { return motesOn; },
    setPlants(value) { plantsOn = value; syncMotion(); },
    setMotes(value) { motesOn = value; syncMotion(); },
    update(dt) {
      const step = Number.isFinite(dt) ? dt : Math.min(scene.getEngine().getDeltaTime() || 0, 50) / 1000;
      syncMotion();
      cooldown = Math.max(0, cooldown - step);
      if (pickPending && cooldown === 0) {
        const hit = scene.pick(scene.pointerX, scene.pointerY, undefined, false, camera);
        hovered = byMesh.has(hit?.pickedMesh) ? hit.pickedMesh : null;
        pickPending = false;
        cooldown = 0.14;
      }
      if (state.motion) state.time += step;
      let attention = 0;
      for (const record of records) {
        const target = record.mesh === hovered ? 1 : 0;
        record.hover += (target - record.hover) * (1 - Math.exp(-step * 3));
        record.pulseTarget = Math.max(0, record.pulseTarget - step * 0.4);
        record.pulse += (record.pulseTarget - record.pulse) * (1 - Math.exp(-step * 3.2));
        const gain = state.motion ? 1 + Math.min(0.7, 0.45 * record.hover + 0.55 * record.pulse) : 0;
        record.bend.influence = gain * Math.sin(state.time * 0.62 + record.phase);
        record.nod.influence = gain * Math.sin(state.time * 0.34 + record.phase * 1.37 + 1.1);
        if (state.motion) attention = Math.max(attention, record.hover, record.pulse);
      }
      if (motes.mesh.isEnabled()) {
        pool.step(step, 1 + 0.65 * attention, true);
        motes.write();
      }
    },
  };
}
