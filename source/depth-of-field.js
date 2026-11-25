import {DepthOfFieldEffect, DepthOfFieldEffectBlurLevel, PostProcessRenderPipeline, Vector3} from '@babylonjs/core';

export function installDepthOfField(scene, camera, subject) {
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  // Babylon's circle-of-confusion shader samples a single-channel depth texture.
  if (!caps.textureHalfFloatRender && !caps.textureFloatRender) return;

  const depth = scene.enableDepthRenderer(camera).getDepthMap();
  const lens = new DepthOfFieldEffect(scene, depth, DepthOfFieldEffectBlurLevel.Low);
  lens.focalLength = 260;
  lens.lensSize = 350;
  lens.fStop = 4;

  // Keep the figurine in focus as the camera orbits.
  const viewPosition = new Vector3();
  function updateFocus() {
    Vector3.TransformCoordinatesToRef(subject, camera.getViewMatrix(), viewPosition);
    lens.focusDistance = Math.max(camera.minZ, -viewPosition.z) * 1000;
  }
  updateFocus();
  scene.onBeforeRenderObservable.add(updateFocus);

  const pipeline = new PostProcessRenderPipeline(engine, 'Terrarium lens');
  pipeline.addEffect(lens);
  const manager = scene.postProcessRenderPipelineManager;
  manager.addPipeline(pipeline);
  manager.attachCamerasToRenderPipeline(pipeline.name, camera);
  lens.getPostProcesses(camera)[0].samples = Math.min(4, caps.maxMSAASamples);
  engine.onResizeObservable.add(() => {
    depth.resize({width: engine.getRenderWidth(), height: engine.getRenderHeight()});
  });
}
