import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

function clay(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.ambientColor = color.scale(0.65);
  material.specularColor = new Color3(0.08, 0.08, 0.08);
  return material;
}

/** Code-built stand-in until the glass vessel and CC0 meshes land. */
export function buildPlaceholder(scene: Scene): void {
  const dish = MeshBuilder.CreateCylinder(
    "dish",
    { diameter: 2.2, height: 0.14, tessellation: 48 },
    scene,
  );
  dish.position.y = 0.07;
  dish.material = clay(scene, "dish-mat", new Color3(0.55, 0.42, 0.32));

  const soil = MeshBuilder.CreateCylinder(
    "soil",
    { diameter: 1.92, height: 0.1, tessellation: 48 },
    scene,
  );
  soil.position.y = 0.16;
  soil.material = clay(scene, "soil-mat", new Color3(0.28, 0.36, 0.22));

  const stone = MeshBuilder.CreateSphere("stone", { diameter: 0.38, segments: 16 }, scene);
  stone.position.set(-0.38, 0.32, 0.14);
  stone.scaling.set(1.15, 0.8, 0.95);
  stone.material = clay(scene, "stone-mat", new Color3(0.46, 0.47, 0.44));

  const sprout = MeshBuilder.CreateCylinder(
    "sprout",
    { diameterTop: 0, diameterBottom: 0.16, height: 0.55, tessellation: 8 },
    scene,
  );
  sprout.position.set(0.34, 0.46, -0.06);
  sprout.material = clay(scene, "sprout-mat", new Color3(0.3, 0.55, 0.28));
}
