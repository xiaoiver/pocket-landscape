import {Matrix, MeshBuilder, PBRMaterial, Quaternion, Vector3, VertexBuffer} from '@babylonjs/core';
import {glassInnerRadiusAt} from './glass.js';

// Place angular fragments in the exposed soil face. Their bases follow the
// actual triangulated bank, including the inset pockets behind the drainage.
export function soilInclusions(scene, earth) {
  const positions = earth.getVerticesData(VertexBuffer.PositionKind);
  const indices = earth.getIndices(), matrices = [], colors = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), p = new Vector3();
  const scale = new Vector3(), spin = new Quaternion(), matrix = new Matrix();
  const world = earth.computeWorldMatrix(true);
  const point = (i, dest) => {
    Vector3.FromArrayToRef(positions, 3 * indices[i], dest);
    Vector3.TransformCoordinatesToRef(dest, world, dest);
  };
  let seed = 3475347;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < indices.length; k += 3) {
    point(k, a); point(k+1, b); point(k+2, c);
    if ([a,b,c].some(v => Math.hypot(v.x, v.z) < 1.16)) continue;
    b.subtractInPlace(a); c.subtractInPlace(a);
    const face = Vector3.Cross(b,c);
    const area = face.length() * .5;
    const upper = Math.abs(face.y) > area;
    const count = Math.floor(area * (upper ? 950 : 640) + random());
    for (let j = 0; j < count; j++) {
      const u = Math.sqrt(random()), v = u * random();
      p.set(a.x+b.x*(u-v)+c.x*v, a.y+b.y*(u-v)+c.y*v, a.z+b.z*(u-v)+c.z*v);
      const r = Math.hypot(p.x,p.z), angle = Math.atan2(p.x,p.z);
      const patch = Math.sin(7*angle + 12*p.y) * Math.cos(19*angle - 8*p.y);
      if (p.y < .21 || random() > .70 + .28*patch) continue;
      const size = .004 + .018 * random() ** 2;
      scale.set(size * (1+random()), size * (.4+.55*random()), size * (.45+.35*random()));
      const recess = .46 * scale.z;
      if (upper) p.y -= scale.y * .46;
      else { p.x *= 1-recess/r; p.z *= 1-recess/r; }
      if (r - recess + scale.z > glassInnerRadiusAt(p.y) - .004) continue;
      Quaternion.RotationYawPitchRollToRef(angle, .12*(random()-.5), 1.2*(random()-.5), spin);
      Matrix.ComposeToRef(scale, spin, p, matrix);
      matrices.push(...matrix.m);
      const shade = .18 + .82*random(), mineral = random() > .93;
      colors.push(shade * (mineral ? .205 : .117), shade * (mineral ? .162 : .069), shade * (mineral ? .112 : .038), 1);
    }
  }
  if (!matrices.length) return;
  const mesh = MeshBuilder.CreateIcoSphere('Soil · embedded fragments', {radius:1, subdivisions:1, flat:true}, scene);
  const material = new PBRMaterial('Humus · bark and mineral fragments', scene);
  material.metallic = 0;
  material.roughness = .92;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.thinInstanceSetBuffer('matrix', Float32Array.from(matrices), 16, true);
  mesh.thinInstanceSetBuffer('color', Float32Array.from(colors), 4, true);
  return mesh;
}
