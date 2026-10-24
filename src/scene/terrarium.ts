import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { terrainHeight } from "./vegetation";
import { soilTexture } from "./textures";
import { random } from "./random";

export function buildGround(scene: Scene, shadow: ShadowGenerator): Mesh[] {
  const ground = MeshBuilder.CreateGround(
    "studio-table",
    { width: 200, height: 200 },
    scene,
  );
  const table = new PBRMaterial("warm-porcelain", scene);
  table.albedoColor = Color3.FromHexString("#c7c3b8");
  table.metallic = 0;
  table.roughness = 0.8;
  ground.material = table;
  ground.receiveShadows = true;
  const soilMat = new PBRMaterial("damp-soil", scene);
  soilMat.albedoTexture = soilTexture(scene);
  soilMat.roughness = 0.98;
  soilMat.metallic = 0;
  const positions: number[] = [],
    indices: number[] = [],
    uvs: number[] = [],
    normals: number[] = [];
  const rings = 20,
    segments = 96;
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= segments; j++) {
      const r = (i / rings) * 0.91,
        a = (j / segments) * Math.PI * 2,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      positions.push(x, terrainHeight(x, z), z);
      uvs.push(x, z);
      if (i < rings && j < segments) {
        const n = i * (segments + 1) + j;
        indices.push(
          n,
          n + segments + 1,
          n + 1,
          n + 1,
          n + segments + 1,
          n + segments + 2,
        );
      }
    }
  const outerStart = rings * (segments + 1);
  const lowerStart = positions.length / 3;
  for (let j = 0; j <= segments; j++) {
    const a = (j / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * 0.76, 0.16, Math.sin(a) * 0.76);
    uvs.push((j / segments) * 4, 0);
    if (j < segments)
      indices.push(
        outerStart + j,
        lowerStart + j,
        outerStart + j + 1,
        outerStart + j + 1,
        lowerStart + j,
        lowerStart + j + 1,
      );
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  data.normals = normals;
  const soil = new Mesh("soil-mound", scene);
  data.applyToMesh(soil);
  soil.material = soilMat;
  soil.receiveShadows = true;
  shadow.addShadowCaster(soil);
  const rnd = random(98);
  const stones: Mesh[] = [];
  for (let variant = 0; variant < 4; variant++) {
    const pebble = MeshBuilder.CreateSphere(
      "substrate-pebbles",
      { diameter: 1, segments: 5 },
      scene,
    );
    const m = new PBRMaterial("pebble-" + variant, scene);
    m.albedoColor = Color3.FromHexString(
      ["#5c4530", "#8b7453", "#3c3427", "#a18c66"][variant],
    );
    m.roughness = 0.9;
    m.metallic = 0;
    pebble.material = m;
    const matrices: number[] = [];
    for (let i = 0; i < 180; i++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd()) * 0.84,
        s = 0.025 + rnd() * 0.055;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const y = i < 100 ? 0.18 + rnd() * 0.19 : terrainHeight(x, z) - 0.012;
      matrices.push(
        ...Matrix.Compose(
          new Vector3(s, s * 0.7, s * 1.2),
          Quaternion.FromEulerAngles(rnd(), rnd() * 6, rnd()),
          new Vector3(x, y, z),
        ).asArray(),
      );
    }
    pebble.thinInstanceSetBuffer(
      "matrix",
      new Float32Array(matrices),
      16,
      true,
    );
    pebble.receiveShadows = true;
    stones.push(pebble);
  }
  return [ground, soil, ...stones];
}

export function buildGlass(scene: Scene): {
  glass: Mesh;
  rim: Mesh;
  refraction: RenderTargetTexture;
} {
  // Closed cross-section: outside wall → polished rim → inside wall → thick bottom.
  // One scene unit is 10 cm; wall thickness is about 2.5 mm.
  const points = [
    [0, 0.045],
    [0.52, 0.045],
    [0.77, 0.12],
    [0.95, 0.36],
    [1.035, 0.85],
    [1.035, 1.55],
    [0.98, 2.15],
    [0.9, 2.56],
    [0.885, 2.61],
    [0.86, 2.61],
    [0.873, 2.55],
    [0.953, 2.15],
    [1.008, 1.55],
    [1.008, 0.85],
    [0.925, 0.38],
    [0.75, 0.19],
    [0.51, 0.145],
    [0, 0.145],
  ].map(([r, y]) => new Vector3(r, y, 0));
  const profile = Curve3.CreateCatmullRomSpline(points, 8, false).getPoints();
  const glass = MeshBuilder.CreateLathe(
    "glass-vessel",
    { shape: profile, tessellation: 160, sideOrientation: Mesh.FRONTSIDE },
    scene,
  );
  const mat = new PBRMaterial("clear-glass", scene);
  mat.metallic = 0;
  mat.roughness = 0.035;
  mat.albedoColor = new Color3(1, 1, 1);
  mat.backFaceCulling = true;
  mat.subSurface.isRefractionEnabled = true;
  mat.subSurface.indexOfRefraction = 1.5;
  mat.subSurface.refractionIntensity = 0.97;
  mat.subSurface.minimumThickness = 0.025;
  mat.subSurface.maximumThickness = 0.025;
  mat.subSurface.tintColor = new Color3(0.96, 0.99, 0.97);
  mat.subSurface.tintColorAtDistance = 4;
  mat.subSurface.useThicknessAsDepth = true;
  const refraction = new RenderTargetTexture(
    "vessel-contents",
    { ratio: 0.75 },
    scene,
    true,
  );
  refraction.coordinatesMode = Texture.PROJECTION_MODE;
  refraction.gammaSpace = false;
  refraction.clearColor = scene.clearColor;
  mat.subSurface.refractionTexture = refraction;
  glass.material = mat;
  const rim = MeshBuilder.CreateTorus(
    "polished-glass-rim",
    { diameter: 1.747, thickness: 0.026, tessellation: 128 },
    scene,
  );
  rim.position.y = 2.603;
  rim.material = mat;
  return { glass, rim, refraction };
}
