// Deep imports: @babylonjs/core marks every file as a side effect, so the
// package barrel would ship the whole engine.
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { buildPlaceholder } from "./placeholder";
import { weatherPresets, type WeatherPreset, type WeatherPresetId } from "./presets";

export interface LandscapeScene {
  engine: Engine;
  scene: Scene;
  applyPreset: (id: WeatherPresetId) => void;
}

function color3(rgb: readonly [number, number, number]): Color3 {
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

export function createLandscapeScene(canvas: HTMLCanvasElement): LandscapeScene {
  const engine = new Engine(canvas, true, {
    adaptToDeviceRatio: true,
    antialias: true,
  });
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "orbit",
    -Math.PI / 2,
    1.05,
    4.4,
    new Vector3(0, 0.2, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 2.2;
  camera.upperRadiusLimit = 9;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.35;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 0;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, -0.2), scene);
  sun.position = new Vector3(4, 8, 3);

  buildPlaceholder(scene);

  const applyPreset = (id: WeatherPresetId): void => {
    paintPreset(scene, hemi, sun, weatherPresets[id]);
  };

  applyPreset("clear");

  return { engine, scene, applyPreset };
}

function paintPreset(
  scene: Scene,
  hemi: HemisphericLight,
  sun: DirectionalLight,
  preset: WeatherPreset,
): void {
  const [r, g, b] = preset.clearColor;
  scene.clearColor = new Color4(r, g, b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = preset.fogDensity;
  scene.fogColor = color3(preset.fogColor);
  scene.ambientColor = color3(preset.ambient);
  hemi.intensity = preset.hemiIntensity;
  hemi.diffuse = color3(preset.hemiDiffuse);
  hemi.groundColor = color3(preset.hemiGround);
  sun.intensity = preset.sunIntensity;
  sun.diffuse = color3(preset.sunDiffuse);
  sun.direction = new Vector3(
    preset.sunDirection[0],
    preset.sunDirection[1],
    preset.sunDirection[2],
  );
}
