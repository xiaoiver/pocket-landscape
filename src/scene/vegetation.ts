import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { leafTexture } from "./textures";
import { random } from "./random";

export function terrainHeight(x: number, z: number): number {
  return 0.48 + 0.13 * Math.sin(x * 3 + z * 2) + 0.13 * (z + 0.8);
}

export function buildPlants(scene: Scene, shadow: ShadowGenerator): Mesh[] {
  const meshes: Mesh[] = [];
  const rnd = random(82);
  const materials = [true, false].map((pink) => {
    const m = new PBRMaterial(pink ? "fittonia" : "peperomia", scene);
    m.albedoTexture = leafTexture(scene, pink);
    m.metallic = 0;
    m.roughness = pink ? 0.7 : 0.55;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    m.subSurface.isTranslucencyEnabled = false;
    m.subSurface.translucencyIntensity = 0.08;
    m.subSurface.tintColor = new Color3(0.5, 0.7, 0.25);
    return m;
  });
  const stemMat = new PBRMaterial("stems", scene);
  stemMat.albedoColor = Color3.FromHexString("#52603b");
  stemMat.roughness = 0.8;
  function stem(name: string, path: Vector3[], radius: number) {
    const m = MeshBuilder.CreateTube(
      name,
      { path, radius, tessellation: 7, cap: Mesh.CAP_ALL },
      scene,
    );
    m.material = stemMat;
    shadow.addShadowCaster(m);
    meshes.push(m);
  }
  function leaf(
    base: Vector3,
    angle: number,
    length: number,
    width: number,
    rise: number,
    pink: boolean,
  ) {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      normals: number[] = [];
    const rows = 22,
      cols = 10;
    const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new Vector3(-dir.z, 0, dir.x);
    const curl = 0.008 + rnd() * 0.018;
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const v = i / rows,
          u = (j / cols) * 2 - 1;
        const w =
          Math.pow(Math.sin(Math.PI * v), pink ? 0.78 : 0.64) * width * 0.5;
        const p = base.add(dir.scale(length * v)).add(side.scale(u * w));
        p.y +=
          rise * v +
          0.035 * Math.sin(Math.PI * v) -
          0.045 * v * v +
          curl * u * u * Math.sin(Math.PI * v);
        // Keep foliage inside the wall below the opening; upper vine tips may emerge.
        const radius = Math.hypot(p.x, p.z);
        if (p.y < 2.55 && radius > 0.91) {
          p.x *= 0.91 / radius;
          p.z *= 0.91 / radius;
        }
        positions.push(p.x, p.y, p.z);
        uvs.push(j / cols, v);
        if (i < rows && j < cols) {
          const a = i * (cols + 1) + j;
          indices.push(
            a,
            a + cols + 1,
            a + 1,
            a + 1,
            a + cols + 1,
            a + cols + 2,
          );
        }
      }
    VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.uvs = uvs;
    const m = new Mesh(pink ? "fittonia-leaf" : "green-leaf", scene);
    vd.applyToMesh(m);
    m.material = materials[pink ? 0 : 1];
    m.receiveShadows = true;
    shadow.addShadowCaster(m);
    meshes.push(m);
  }
  // Compact opposite leaf pairs, rather than a scaled-down full-size tropical plant.
  for (const [cx, cz, height, rotation] of [
    [0.18, -0.12, 1.25, 0],
    [-0.35, 0.2, 1.02, 1.3],
    [0.43, 0.32, 1.3, 2.1],
  ]) {
    const ground = terrainHeight(cx, cz);
    const origin = new Vector3(cx, ground, cz);
    const tip = origin.add(new Vector3(-0.07, height, 0.03));
    stem(
      "fittonia-stem",
      [origin, origin.add(new Vector3(0, height * 0.45, 0)), tip],
      0.012,
    );
    for (let level = 0; level < 4; level++)
      for (let pair = 0; pair < 2; pair++) {
        const a = rotation + level * 1.5 + pair * Math.PI;
        const attachment = origin.add(
          new Vector3((-0.05 * level) / 3, 0.25 + level * height * 0.23, 0.02),
        );
        const base = attachment.add(
          new Vector3(Math.cos(a) * 0.07, 0.025, Math.sin(a) * 0.07),
        );
        stem("leaf-petiole", [attachment, base], 0.006);
        const len = (0.57 + rnd() * 0.14) * (1 - level * 0.07);
        leaf(
          base,
          a,
          len,
          len * 0.77,
          Math.sin(a) * 0.27 + (level === 3 ? 0.08 : -0.04),
          true,
        );
      }
  }
  for (const [cx, cz, height, rot] of [
    [-0.37, 0.4, 1.65, 0.6],
    [0.25, 0.45, 1.9, 2.3],
  ]) {
    const y = terrainHeight(cx, cz);
    const path = Array.from(
      { length: 12 },
      (_, i) =>
        new Vector3(
          cx + Math.sin((i / 11) * 2) * 0.16,
          y + (height * i) / 11,
          cz,
        ),
    );
    stem("green-vine", path, 0.014);
    for (let i = 2; i < 11; i += 2) {
      const base = path[i];
      const a = rot + i * 1.9;
      leaf(base, a, 0.33 + rnd() * 0.12, 0.3, 0.12, false);
    }
  }
  return meshes;
}

export async function buildMoss(scene: Scene): Promise<Mesh[]> {
  const imported = await ImportMeshAsync("/assets/moss/moss_01_1k.gltf", scene);
  const rnd = random(43);
  const moss: Mesh[] = [];
  for (const source of imported.meshes) {
    if (!(source instanceof Mesh) || !source.getTotalVertices()) continue;
    // The download contains twelve tiny sprig variants, not a preassembled ground patch.
    source.parent = null;
    source.position.setAll(0);
    source.rotationQuaternion = Quaternion.Identity();
    source.scaling.setAll(1);
    const mat = source.material as PBRMaterial;
    mat.opacityTexture = new Texture(
      "/assets/moss/textures/moss_01_alpha_1k.png",
      scene,
      false,
      false,
    );
    mat.opacityTexture.getAlphaFromRGB = true;
    mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    mat.alphaCutOff = 0.4;
    mat.twoSidedLighting = true;
    mat.roughness = 0.95;
    if (mat.bumpTexture) mat.bumpTexture.level = 0.35;
    const matrices: number[] = [];
    for (let i = 0; i < 480; i++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd()) * 0.83;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const s = 3.2 + rnd() * 2.4;
      const matrix = Matrix.Compose(
        new Vector3(s, s * (0.75 + rnd() * 0.45), s),
        Quaternion.FromEulerAngles(
          (rnd() - 0.5) * 0.4,
          rnd() * Math.PI * 2,
          (rnd() - 0.5) * 0.35,
        ),
        new Vector3(x, terrainHeight(x, z) - 0.012, z),
      );
      matrices.push(...matrix.asArray());
    }
    source.thinInstanceSetBuffer(
      "matrix",
      new Float32Array(matrices),
      16,
      true,
    );
    source.receiveShadows = true;
    moss.push(source);
  }
  return moss;
}
