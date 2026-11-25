import {Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';
import {settleSoilShoulder, soilHeight} from './substrate.js';

function hash(x, z, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 69069);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(lo, hi, value) {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// Overlapping irregular cushions share a height field with their folded leaf tips.
function colony(x, z) {
  const u = x * 4.6 + .22 * Math.sin(8 * z + 2 * x);
  const v = z * 5.1 + .23 * Math.sin(6 * x - 3 * z);
  let crown = 0;
  for (let j = Math.floor(v) - 1; j <= Math.floor(v) + 1; j++) {
    for (let i = Math.floor(u) - 1; i <= Math.floor(u) + 1; i++) {
      const dx = (u - i - .12 - .76 * hash(i, j, 1)) / (.47 + .45 * hash(i, j, 2));
      const dz = (v - j - .12 - .76 * hash(i, j, 3)) / (.48 + .39 * hash(i, j, 4));
      crown = Math.max(crown, Math.max(0, 1 - dx * dx - dz * dz) * (.5 + .5 * hash(i, j, 5)));
    }
  }
  return crown;
}

function liftBed(mesh, tips, settled) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind, false, true);
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind, false, true);
  const point = new Vector3();
  const channels = colors.length / (positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const cover = smooth(.003, .043, y - soilHeight(x, z));
    const crown = colony(x, z);
    point.set(x, y, z);
    if (settled) settleSoilShoulder(point);
    point.y += cover * (.102 * crown - .004);
    point.toArray(positions,i);
    const light = tips ? .85 + .65 * crown : .62 + .54 * crown;
    const k = i / 3 * channels;
    colors[k] *= light * (.91 + .17 * crown);
    colors[k + 1] *= light * 1.05;
    colors[k + 2] *= light * .82;
  }
  const indices = mesh.getIndices();
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals, {useRightHandedSystem: mesh.getScene().useRightHandedSystem});
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, channels);
  mesh.refreshBoundingInfo();
  return positions;
}

export function createMossTuft(scene) {
  const positions = [], colors = [], indices = [];
  // Short folded, tapering leaves. A darker foot and lighter midrib give the
  // carpet depth even when its tiny self-shadows are below shadow-map resolution.
  for (let k = 0; k < 7; k++) {
    const a = k * 2.39996, dx = Math.cos(a), dz = Math.sin(a);
    const reach = .010 + .014 * hash(k, 0, 6), h = .017 + .022 * hash(k, 0, 7);
    const w = .0024 + .0022 * hash(k, 0, 8), i = positions.length / 3;
    positions.push(dx * .002, -.003, dz * .002,
      dx * reach * .43 - dz * w, h * .59, dz * reach * .43 + dx * w,
      dx * reach * .39, h * .74, dz * reach * .39,
      dx * reach * .43 + dz * w, h * .59, dz * reach * .43 - dx * w,
      dx * reach, h, dz * reach);
    colors.push(.032,.066,.009,1, .11,.22,.029,1, .20,.32,.043,1, .086,.16,.021,1, .30,.40,.067,1);
    indices.push(i,i+1,i+2, i,i+2,i+3, i+1,i+4,i+2, i+2,i+4,i+3);
  }
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals, {useRightHandedSystem: scene.useRightHandedSystem});
  const mesh = new Mesh('Moss · clustered shoots', scene);
  const data = new VertexData();
  Object.assign(data, {positions, colors, normals, indices});
  data.applyToMesh(mesh);
  const mat = new PBRMaterial('Moss · young tips', scene);
  mat.metallic = 0;
  mat.roughness = .82;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

export function prepareMossCushions(scene, bank, rosettes, {lightweight, settled}) {
  if (!bank || !rosettes) return;
  const shootDensity = lightweight ? 950 : 2150;
  const bed = liftBed(bank, false, settled);
  liftBed(rosettes, true, settled);
  const indices = bank.getIndices(), matrices = [], tints = [];
  const at = new Vector3(), scale = new Vector3(), spin = new Quaternion(), transform = new Matrix();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] * 3, b = indices[k + 1] * 3, c = indices[k + 2] * 3;
    const dx = bed[b] - bed[a], dz = bed[b+2] - bed[a+2];
    const ex = bed[c] - bed[a], ez = bed[c+2] - bed[a+2];
    const area = .5 * Math.abs(dx * ez - dz * ex);
    if (hash(k, 0, 9) > area * shootDensity) continue;
    const u = Math.sqrt(hash(k, 0, 10)), v = u * hash(k, 0, 11);
    at.set(bed[a] + dx * (u-v) + ex * v,
      bed[a+1] + (bed[b+1]-bed[a+1]) * (u-v) + (bed[c+1]-bed[a+1]) * v,
      bed[a+2] + dz * (u-v) + ez * v);
    if (at.y < soilHeight(at.x, at.z) + .018 || Math.hypot(at.x, at.z) > 1.30) continue;
    const crown = colony(at.x, at.z), variation = hash(k, 0, 12);
    const s = .56 + .53 * variation + .45 * crown;
    scale.set(s, s * (.81 + .36 * hash(k, 0, 13)), s);
    Quaternion.RotationYawPitchRollToRef(6.283 * hash(k, 0, 14), .21 * Math.sin(11 * at.x), .19 * Math.cos(9 * at.z), spin);
    Matrix.ComposeToRef(scale, spin, at, transform);
    matrices.push(...transform.m);
    const warm = .5 + .5 * Math.sin(7 * at.x + 1.3 * Math.sin(6 * at.z));
    const tint = .56 + .31 * variation + .24 * crown;
    tints.push(tint * (.74 + .29 * warm + .18 * crown), tint, tint * (.7 + .32 * (1 - warm)), 1);
  }
  const mesh = createMossTuft(scene);
  const transforms = Float32Array.from(matrices), colors = Float32Array.from(tints);
  mesh.thinInstanceSetBuffer('matrix',transforms,16,true);
  mesh.thinInstanceSetBuffer('color',colors,4,true);
  return {mesh,matrices:transforms,colors};
}
