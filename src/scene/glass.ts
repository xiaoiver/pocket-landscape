import { Constants } from "@babylonjs/core/Engines/constants";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

// Scene unit = 10 cm. Profiles share endpoints; there is no solid "glass-filled" interior.
const outerProfile = [
  [0.84, 0.2],
  [0.935, 0.36],
  [1.015, 0.75],
  [1.04, 1.15],
  [1.035, 1.55],
  [1.01, 1.95],
  [0.96, 2.3],
  [0.887, 2.6],
];
const innerProfile = [
  [0.81, 0.24],
  [0.907, 0.36],
  [0.99, 0.75],
  [1.015, 1.15],
  [1.01, 1.55],
  [0.985, 1.95],
  [0.934, 2.3],
  [0.859, 2.6],
];

export interface GlassAssembly {
  meshes: Mesh[];
  refraction: RenderTargetTexture;
  updateContents: (contents: AbstractMesh[]) => void;
}

/** Keep duplicated seam vertices' normals exactly radial, avoiding a vertical reflection seam. */
function finishSurface(mesh: Mesh): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind)!;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3],
      z = positions[i * 3 + 2],
      r = Math.hypot(x, z);
    if (r > 0.00001) {
      const radial = (normals[i * 3] * x + normals[i * 3 + 2] * z) / r;
      const length = Math.hypot(radial, normals[i * 3 + 1]);
      if (length > 0.00001) {
        normals[i * 3] = (radial * x) / r / length;
        normals[i * 3 + 1] /= length;
        normals[i * 3 + 2] = (radial * z) / r / length;
      }
    }
    // Height-based UVs make the thickness map independent of profile arc length.
    uvs[i * 2 + 1] = positions[i * 3 + 1] / 2.62;
  }
  mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

function lathe(scene: Scene, name: string, profile: number[][]): Mesh {
  const points = Curve3.CreateCatmullRomSpline(
    profile.map(([r, y]) => new Vector3(r, y, 0)),
    10,
    false,
  ).getPoints();
  const mesh = MeshBuilder.CreateLathe(
    name,
    { shape: points, tessellation: 192, sideOrientation: Mesh.FRONTSIDE },
    scene,
  );
  finishSurface(mesh);
  mesh.isPickable = false;
  return mesh;
}

function wallThickness(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    "glass-wall-thickness",
    { width: 16, height: 256 },
    scene,
    false,
  );
  const ctx = texture.getContext();
  for (let y = 0; y < 256; y++) {
    const height = (y / 255) * 2.62;
    const thickness =
      0.025 +
      0.007 * Math.exp(-Math.pow((height - 0.22) / 0.22, 2)) +
      0.003 * Math.exp(-Math.pow((height - 2.6) / 0.06, 2));
    const value = Math.round(((thickness - 0.02) / 0.02) * 255);
    ctx.fillStyle = `rgb(${value},255,255)`;
    ctx.fillRect(0, y, 16, 1);
  }
  texture.gammaSpace = false;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.update(false);
  return texture;
}

export function buildGlass(
  scene: Scene,
  reflection: BaseTexture,
): GlassAssembly {
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  const type =
    caps.textureHalfFloatRender && caps.textureHalfFloatLinearFiltering
      ? Constants.TEXTURETYPE_HALF_FLOAT
      : caps.textureFloatRender && caps.textureFloatLinearFiltering
        ? Constants.TEXTURETYPE_FLOAT
        : Constants.TEXTURETYPE_UNSIGNED_BYTE;
  // Capture linear HDR before ACES. RGBA8 clips bright leaves and softbox highlights.
  const refraction = new RenderTargetTexture(
    "vessel-contents-hdr",
    { ratio: 1 },
    scene,
    {
      generateMipMaps: true,
      type,
      samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
      generateDepthBuffer: true,
      gammaSpace: false,
    },
  );
  refraction.coordinatesMode = Texture.PROJECTION_MODE;
  refraction.useCameraPostProcesses = false;
  refraction.clearColor = scene.clearColor;
  refraction.samples = 2;

  function transparentGlass(
    name: string,
    thickness: number,
    roughness: number,
  ): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    material.metallic = 0;
    material.roughness = roughness;
    material.albedoColor = Color3.White();
    material.reflectionTexture = reflection;
    material.backFaceCulling = true;
    material.subSurface.isRefractionEnabled = true;
    material.subSurface.refractionIntensity = 1;
    material.subSurface.indexOfRefraction = 1.5;
    material.subSurface.minimumThickness = 0;
    material.subSurface.maximumThickness = thickness;
    material.subSurface.useThicknessAsDepth = true;
    material.subSurface.tintColor = new Color3(0.92, 0.98, 0.945);
    material.subSurface.tintColorAtDistance = 2.5;
    material.subSurface.refractionTexture = refraction;
    // The very clear body should preserve contents rather than sampling blurred mips.
    material.subSurface.refractionTexture.lodGenerationScale = 0;
    material.subSurface.refractionTexture.lodGenerationOffset = 0;
    material.metadata = { role: "glass", thickness };
    return material;
  }

  const wall = lathe(scene, "glass-outer-wall", outerProfile);
  const body = transparentGlass("glass-body", 0.025, 0.012);
  body.subSurface.thicknessTexture = wallThickness(scene);
  body.subSurface.minimumThickness = 0.02;
  body.subSurface.maximumThickness = 0.04; // Babylon passes (max - min) as the shader range.
  body.subSurface.useGltfStyleTextures = false;
  body.subSurface.useMaskFromThicknessTexture = false;
  wall.material = body;

  const inside = lathe(scene, "glass-inner-wall", [...innerProfile].reverse());
  const innerMaterial = new PBRMaterial("glass-inner-reflection", scene);
  innerMaterial.metallic = 0;
  innerMaterial.roughness = 0.015;
  innerMaterial.albedoColor = Color3.Black();
  innerMaterial.reflectionTexture = reflection;
  innerMaterial.environmentIntensity = 0.45;
  innerMaterial.alpha = 0.08;
  innerMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  innerMaterial.backFaceCulling = true;
  innerMaterial.useRadianceOverAlpha = true;
  innerMaterial.useSpecularOverAlpha = true;
  innerMaterial.metadata = { role: "glass-inner" };
  inside.material = innerMaterial;
  // The back wall is composited into the capture, then seen through the front wall.
  // It never samples that same capture, so there is no recursive refraction feedback.
  inside.isVisible = false;
  refraction.onBeforeRenderObservable.add(() => {
    inside.isVisible = inside.isEnabled();
  });
  refraction.onAfterRenderObservable.add(() => {
    inside.isVisible = false;
  });

  const foot = lathe(scene, "glass-heavy-base", [
    [0, 0.05],
    [0.45, 0.05],
    [0.68, 0.075],
    [0.8, 0.145],
    [0.84, 0.2],
    [0.81, 0.24],
    [0.7, 0.18],
    [0.48, 0.16],
    [0, 0.16],
  ]);
  foot.material = transparentGlass("glass-thick-base", 0.11, 0.018);
  // 24 tube segments are sufficient for a polished lip; CreateTorus would also
  // use the 192 circumference segments around its tube (about 74k triangles).
  const rim = MeshBuilder.CreateLathe(
    "glass-rolled-rim",
    {
      shape: Array.from({ length: 25 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        return new Vector3(
          0.873 + Math.cos(angle) * 0.014,
          2.6 + Math.sin(angle) * 0.014,
          0,
        );
      }),
      tessellation: 192,
    },
    scene,
  );
  const rimPositions = rim.getVerticesData(VertexBuffer.PositionKind)!;
  const rimNormals = rim.getVerticesData(VertexBuffer.NormalKind)!;
  for (let i = 0; i < rimPositions.length; i += 3) {
    const r = Math.hypot(rimPositions[i], rimPositions[i + 2]);
    const radial = (r - 0.873) / 0.014;
    rimNormals[i] = (radial * rimPositions[i]) / r;
    rimNormals[i + 1] = (rimPositions[i + 1] - 2.6) / 0.014;
    rimNormals[i + 2] = (radial * rimPositions[i + 2]) / r;
  }
  rim.setVerticesData(VertexBuffer.NormalKind, rimNormals);
  rim.material = transparentGlass("glass-polished-rim", 0.028, 0.008);
  rim.isPickable = false;
  const meshes = [wall, inside, foot, rim];
  return {
    meshes,
    refraction,
    updateContents: (contents) => {
      refraction.renderList = [
        ...contents.filter(
          (mesh) =>
            !meshes.includes(mesh as Mesh) &&
            mesh.isEnabled() &&
            mesh.isVisible,
        ),
        inside,
      ];
    },
  };
}
