import {MorphTarget, MorphTargetManager, Vector3, VertexBuffer} from '@babylonjs/core';

function smoothstep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// Babylon applies morph targets in the color, refraction, shadow and camera-depth passes.
export function createPlantSway(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  const bendPositions = new Float32Array(positions);
  const nodPositions = new Float32Array(positions);
  const bendNormals = normals && new Float32Array(normals);
  const {minimum, maximum, center} = mesh.getBoundingInfo().boundingBox;
  const height = Math.max(0.05, maximum.y - minimum.y);
  const radius = Math.max(0.05, maximum.x - minimum.x, maximum.z - minimum.z) / 2;
  const world = mesh.computeWorldMatrix(true);
  const inverse = world.clone().invert();
  const point = new Vector3(), offset = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    Vector3.FromArrayToRef(positions, i, point);
    const along = (point.y - minimum.y) / height;
    const reach = Math.min(1, Math.hypot(point.x - center.x, point.z - center.z) / radius);
    const weight = along * (0.35 + 0.65 * along) * (0.7 + 0.3 * reach);
    Vector3.TransformCoordinatesToRef(point, world, point);
    const r = Math.hypot(point.x, point.z);
    const x = r > 0.0001 ? point.x / r : 0, z = r > 0.0001 ? point.z / r : -1;
    const room = Math.max(1 - smoothstep(1.02, 1.22, r), smoothstep(1.36, 1.5, point.y));
    const amp = 0.032 * weight * (0.58 + 0.42 * room);
    offset.set(-z, 0, x);
    Vector3.TransformNormalToRef(offset, inverse, offset);
    bendPositions[i] += offset.x * amp;
    bendPositions[i + 1] += offset.y * amp;
    bendPositions[i + 2] += offset.z * amp;
    if (normals) {
      Vector3.FromArrayToRef(normals, i, point);
      point.addInPlace(offset.scaleInPlace(0.16 * weight)).normalize().toArray(bendNormals, i);
    }
    offset.set(x * 0.28 * room, 0.24, z * 0.28 * room);
    Vector3.TransformNormalToRef(offset, inverse, offset);
    nodPositions[i] += offset.x * amp;
    nodPositions[i + 1] += offset.y * amp;
    nodPositions[i + 2] += offset.z * amp;
  }
  const manager = new MorphTargetManager(mesh.getScene());
  manager.optimizeInfluencers = false;
  const bend = new MorphTarget('Leaf bend', 0, mesh.getScene());
  const nod = new MorphTarget('Leaf nod', 0, mesh.getScene());
  bend.setPositions(bendPositions);
  nod.setPositions(nodPositions);
  if (normals) {
    bend.setNormals(bendNormals);
    nod.setNormals(normals);
  }
  manager.addTarget(bend);
  manager.addTarget(nod);
  mesh.morphTargetManager = manager;
  return {bend, nod};
}
