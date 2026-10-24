import "@babylonjs/core/Shaders/imageProcessing.fragment";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
// Register post-process shaders before the first frame (also during Vite HMR).
import "@babylonjs/core/Shaders/hdrFiltering.vertex";
import "@babylonjs/core/Shaders/hdrFiltering.fragment";
import "@babylonjs/core/Shaders/fxaa.vertex";
import "@babylonjs/core/Shaders/fxaa.fragment";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Scene } from "@babylonjs/core/scene";
import { buildGlass, buildGround } from "./terrarium";
import { buildPlants, buildMoss } from "./vegetation";
import { weatherPresets, type WeatherPresetId } from "./presets";

export interface LandscapeScene {
  engine: Engine;
  scene: Scene;
  ready: Promise<void>;
  applyPreset: (id: WeatherPresetId) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
}

export function createLandscapeScene(
  canvas: HTMLCanvasElement,
): LandscapeScene {
  const engine = new Engine(canvas, true, {
    adaptToDeviceRatio: true,
    antialias: true,
  });
  engine.setHardwareScalingLevel(
    1 / Math.min(window.devicePixelRatio || 1, 1.5),
  );
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.78, 0.77, 0.73, 1);
  const camera = new ArcRotateCamera(
    "orbit",
    -Math.PI / 2 - 0.15,
    1.18,
    6.4,
    new Vector3(0, 1.42, 0),
    scene,
  );
  camera.fov = 0.62;
  camera.minZ = 0.03;
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 3.5;
  camera.upperRadiusLimit = 9;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = 1.55;
  camera.wheelDeltaPercentage = 0.015;
  camera.panningSensibility = 0;
  const hemi = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.15;
  const sun = new DirectionalLight(
    "softbox-key",
    new Vector3(-0.7, -1, 0.5),
    scene,
  );
  sun.position = new Vector3(3, 6, -4);
  const shadow = new ShadowGenerator(2048, sun);
  shadow.useContactHardeningShadow = true;
  shadow.contactHardeningLightSizeUVRatio = 0.07;
  shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadow.bias = 0.0003;
  shadow.normalBias = 0.015;
  sun.shadowMinZ = 0.1;
  sun.shadowMaxZ = 14;
  let environmentLoaded!: () => void;
  let environmentFailed!: (reason: Error) => void;
  const environmentReady = new Promise<void>((resolve, reject) => {
    environmentLoaded = resolve;
    environmentFailed = reject;
  });
  const environment = new HDRCubeTexture(
    "/assets/environment/studio_small_09_1k.hdr",
    scene,
    256,
    false,
    true,
    false,
    true,
    environmentLoaded,
    (message) =>
      environmentFailed(new Error(message || "HDR environment failed to load")),
  );
  environment.rotationY = 0.5;
  scene.environmentTexture = environment;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.1;
  scene.imageProcessingConfiguration.contrast = 1.08;
  const pipeline = new DefaultRenderingPipeline("photographic", true, scene, [
    camera,
  ]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = false;
  const ground = buildGround(scene, shadow);
  const plants = buildPlants(scene, shadow);
  const { glass, rim, refraction } = buildGlass(scene);
  const layers = new Map<string, { setEnabled: (value: boolean) => void }[]>([
    ["glass", [glass, rim]],
    ["plants", plants],
    ["soil", ground.slice(1)],
    ["moss", []],
  ]);
  const visibility = new Map<string, boolean>();
  const updateRefraction = () => {
    refraction.renderList = scene.meshes.filter(
      (m) => m.material !== glass.material && m.isEnabled() && m.isVisible,
    );
  };
  const applyPreset = (id: WeatherPresetId): void => {
    const p = weatherPresets[id];
    scene.fogMode = Scene.FOGMODE_NONE;
    sun.intensity = p.keyIntensity;
    sun.diffuse = Color3.FromArray([...p.keyColor]);
    sun.direction = Vector3.FromArray([...p.keyDirection]);
    hemi.intensity = p.fillIntensity;
    hemi.diffuse = Color3.FromArray([...p.fillColor]);
    scene.environmentIntensity = p.environmentIntensity;
    environment.rotationY = p.environmentRotation;
    scene.imageProcessingConfiguration.exposure = p.exposure;
  };
  applyPreset("clear");
  updateRefraction();
  const ready = Promise.all([buildMoss(scene), environmentReady]).then(
    ([moss]) => {
      if (scene.isDisposed) return;
      layers.set("moss", moss);
      for (const m of moss) m.setEnabled(visibility.get("moss") ?? true);
      updateRefraction();
      return scene.whenReadyAsync().then(() => {
        if (import.meta.env.DEV)
          console.info(
            "[场景就绪]",
            JSON.stringify({
              meshes: scene.meshes.length,
              triangles: scene.meshes.reduce(
                (sum, mesh) =>
                  sum +
                  (mesh.getTotalIndices() / 3) *
                    Math.max(
                      1,
                      "thinInstanceCount" in mesh
                        ? Number(mesh.thinInstanceCount)
                        : 1,
                    ),
                0,
              ),
            }),
          );
      });
    },
  );
  return {
    engine,
    scene,
    ready,
    applyPreset,
    setLayerVisible: (id, visible) => {
      visibility.set(id, visible);
      for (const mesh of layers.get(id) ?? []) mesh.setEnabled(visible);
      updateRefraction();
    },
  };
}
