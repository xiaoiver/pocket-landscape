import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshBuilder, NullEngine, PBRMaterial, Scene, VertexBuffer} from '@babylonjs/core';
import {prepareFoliage} from '../source/foliage.js';

const engine = new NullEngine();
const scene = new Scene(engine);
function specimen(name, material = new PBRMaterial(name,scene)) {
  const mesh = MeshBuilder.CreateSphere(name,{segments:6},scene);
  mesh.material = material;
  return mesh;
}

try {
  const fernB = specimen('Fern 02 · B');
  const fernC = specimen('Fern 02 · C',fernB.material);
  const scan = specimen('Pink Angel Fittonia · harenil');
  const blade = specimen('Canopy 0');
  const earth = specimen('Earth · planted bank');
  const scanNormals = Array.from(scan.getVerticesData(VertexBuffer.NormalKind));
  prepareFoliage(scene,[fernB,fernC,scan,blade,earth]);

  // One cutout material is shared, but both crowns need their own per-vertex shading.
  assert.ok(fernB.material.pluginManager.getPlugin('Fern leaflet coverage'));
  for (const fern of [fernB,fernC]) {
    const colors = fern.getVerticesData(VertexBuffer.ColorKind);
    assert.equal(colors.length,fern.getTotalVertices()*4);
    assert.ok(Math.min(...colors)<.85);
    assert.ok(colors.every((value,index)=>index%4!==3 || value===1));
    assert.equal(fern.material.clearCoat.isEnabled,true);
  }
  for (const leaf of [scan,blade,fernB]) {
    assert.equal(leaf.material.subSurface.isTranslucencyEnabled,true);
    assert.equal(leaf.material.subSurface.isRefractionEnabled,false);
    assert.equal(leaf.material.backFaceCulling,false);
  }
  assert.ok(blade.material.subSurface.translucencyIntensityTexture);
  assert.equal(scan.material.subSurface.translucencyIntensityTexture,null);
  assert.deepEqual(Array.from(scan.getVerticesData(VertexBuffer.NormalKind)),scanNormals);
  assert.equal(earth.material.subSurface.isTranslucencyEnabled,false);
  assert.equal(earth.material.backFaceCulling,true);
  console.log('Leaf transmission, shared fern material, separate crown shading and scan normals passed.');
} finally {
  scene.dispose();
  engine.dispose();
}


// Both deliverables bake the fern positions in glTF world coordinates. Keeping all
// vertices inside this convex cylinder also keeps triangle interiors off the rim.
for (const asset of ['../source/assets/specimens/plants.glb','../woodland-specimens.glb']) {
  const bytes = readFileSync(new URL(asset,import.meta.url));
  const jsonEnd = 20+bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8',20,jsonEnd));
  const ferns = gltf.nodes.filter(node=>node.name.startsWith('Fern 02'));
  assert.equal(ferns.length,2);
  for (const node of ferns) {
    assert.ok(!node.matrix && !node.translation && !node.rotation && !node.scale);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const view = gltf.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType,5126);
      const start = jsonEnd+8+(view.byteOffset??0)+(accessor.byteOffset??0);
      for (let i=0; i<accessor.count; i++) {
        const at=start+i*(view.byteStride??12);
        assert.ok(Math.hypot(bytes.readFloatLE(at),bytes.readFloatLE(at+8))<=1.325, node.name+' crosses its planting envelope');
      }
    }
  }
}
console.log('Both exported fern crowns fit inside the glass.');
