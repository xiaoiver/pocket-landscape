import {Vector2, VertexBuffer} from '@babylonjs/core';

// Both fern crowns use the same cutout atlas. Cache its alpha channel once so
// pointer picks can reject transparent triangles without a GPU read on each tap.
async function readAlpha(texture) {
  if (!texture.isReady()) await new Promise(resolve => texture.onLoadObservable.addOnce(resolve));
  const rgba = await texture.readPixels();
  if (!rgba) return null;
  const {width, height} = texture.getSize();
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return {alpha, width, height};
}

export function enableLeafPicking(mesh, atlases) {
  const material = mesh.material;
  const texture = material.getAlphaTestTexture();
  if (!material.needAlphaTestingForMesh(mesh) || !texture) {
    mesh.isPickable = true;
    return;
  }
  mesh.isPickable = false;
  if (!atlases.has(texture)) atlases.set(texture, readAlpha(texture).catch(() => null));
  return atlases.get(texture).then(atlas => {
    if (!atlas || mesh.isDisposed()) return;
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const {width, height, alpha} = atlas;
    const uv = new Vector2();
    function hitsLeaf(p0, p1, p2, ray, a, b, c) {
      const hit = ray.intersectsTriangle(p0, p1, p2);
      if (!hit) return false;
      const w = 1 - hit.bu - hit.bv;
      const u = hit.bu * uvs[a * 2] + hit.bv * uvs[b * 2] + w * uvs[c * 2];
      const v = hit.bu * uvs[a * 2 + 1] + hit.bv * uvs[b * 2 + 1] + w * uvs[c * 2 + 1];
      const m = texture.getTextureMatrix().m;
      uv.set(u * m[0] + v * m[4] + m[8], u * m[1] + v * m[5] + m[9]);
      const px = Math.floor((uv.x - Math.floor(uv.x)) * width);
      const py = Math.floor((uv.y - Math.floor(uv.y)) * height);
      return alpha[py * width + px] >= 255 * material.alphaCutOff;
    }
    const intersects = mesh.intersects.bind(mesh);
    const morphBounds = {applyMorph: true, cache: {}};
    let lastFrame = -1;
    mesh.intersects = (ray, fastCheck, predicate, ...rest) => {
      const frame = mesh.getScene().getFrameId();
      if (mesh.morphTargetManager && frame !== lastFrame) {
        mesh.refreshBoundingInfo(morphBounds);
        lastFrame = frame;
      }
      const filter = predicate ? (...args) => predicate(...args) && hitsLeaf(...args) : hitsLeaf;
      return intersects(ray, fastCheck, filter, ...rest);
    };
    mesh.isPickable = true;
  });
}
