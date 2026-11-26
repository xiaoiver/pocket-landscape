import assert from 'node:assert/strict';
import {
  ArcRotateCamera, BaseTexture, Constants, MeshBuilder, NullEngine, Scene, Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { installGlass } from '../source/glass.js';

// Tests only setup/ownership and mesh orientation; shader pixels require WebGL2.
function fixture({ supportsHDR, forceLightweight = false }) {
  const engine = new NullEngine({ renderWidth:1000, renderHeight:700 });
  Object.defineProperty(engine, 'webGLVersion', { value:2 });
  Object.assign(engine.getCaps(), {
    textureHalfFloatRender:supportsHDR, textureHalfFloatLinearFiltering:supportsHDR,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.environmentIntensity = .42;
  // The pure setup test does not decode Babylon's bundled RGBD environment BRDF.
  scene.environmentBRDFTexture = new BaseTexture(scene);
  const camera = new ArcRotateCamera('camera',1.66,1.3,10,Vector3.Zero(),scene);
  const a = MeshBuilder.CreateBox('A',{},scene);
  const b = MeshBuilder.CreateBox('B',{},scene);
  b.setEnabled(false);
  const glass = installGlass(scene,camera,new BaseTexture(scene),[a,b],{
    forceLightweight, layers:{caustic:false}, animateDrops:false,
  });
  glass.update();
  glass.resize?.();
  return {engine,scene,a,b,glass};
}

function checkVesselSwitch(scene,glass) {
  const rim = scene.getMeshByName('Rounded glass lip');
  const wall = scene.getMeshByName('Clear handblown wall');
  const rear = scene.getMeshByName('Reflection-only inner wall');
  const original = Array.from(rim.getVerticesData(VertexBuffer.PositionKind));
  const count = scene.meshes.length;
  glass.setVessel('bottle');
  assert(rim.getBoundingInfo().maximum.y > 2 && rim.getBoundingInfo().maximum.x < .75);
  assert(wall.getBoundingInfo().maximum.y > 2);
  if (rear) assert.equal(rear.getBoundingInfo().maximum.y,wall.getBoundingInfo().maximum.y);
  glass.setVessel('bowl');
  const points=rim.getVerticesData(VertexBuffer.PositionKind);
  let front=-Infinity,back=Infinity,frontHeight,backHeight;
  for (let i=0;i<points.length;i+=3) {
    if (points[i+2]>front) {front=points[i+2];frontHeight=points[i+1];}
    if (points[i+2]<back) {back=points[i+2];backHeight=points[i+1];}
  }
  assert(backHeight-frontHeight>1.4,'opening faces the default view');
  assert(wall.getBoundingInfo().maximum.x>1.43,'the belly extends beyond the heel');
  if (rear) assert(Math.abs(rear.getBoundingInfo().maximum.y-wall.getBoundingInfo().maximum.y)<.01);
  glass.setVessel('open');
  assert.deepEqual(Array.from(rim.getVerticesData(VertexBuffer.PositionKind)),original);
  assert.equal(scene.meshes.length,count);
}

function radialNormal(mesh) {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind);
  const n = mesh.getVerticesData(VertexBuffer.NormalKind);
  let signedSum=0;
  for (let i=0; i<p.length; i+=3) signedSum += p[i]*n[i]+p[i+2]*n[i+2];
  return signedSum/(p.length/3);
}

{
  const {engine,scene,a,b,glass} = fixture({supportsHDR:true});
  const wall = scene.getMeshByName('Clear handblown wall');
  const foot = scene.getMeshByName('Polished foot');
  const rim = scene.getMeshByName('Rounded glass lip');
  const rear = scene.getMeshByName('Reflection-only inner wall');
  const caustic = scene.getMeshByName('Approximate tabletop caustic');
  const capture = foot.material.subSurface.refractionTexture;
  const thickness = wall.material.getActiveTextures().find(t=>t.name==='Calibrated optical wall thickness');
  assert.equal(glass.highQuality,true);
  assert.equal(scene.customRenderTargets.length,0,'capture registered once through PBR');
  assert.equal(rim.material.subSurface.refractionTexture,capture);
  assert(wall.material.getActiveTextures().includes(capture));
  assert(!rear.material.getActiveTextures().includes(capture),'rear wall does not recurse');
  assert(radialNormal(wall)>.7 && radialNormal(rear)<-.7);
  assert.deepEqual(capture.renderList.map(m=>m.name),[a,b,rear,caustic].map(m=>m.name));
  assert.deepEqual({...capture.getSize()},{width:500,height:350});
  assert.equal(capture.gammaSpace,false);
  assert.equal(capture.textureType,Constants.TEXTURETYPE_HALF_FLOAT);
  assert.equal(thickness.textureType,Constants.TEXTURETYPE_UNSIGNED_BYTE);
  assert.deepEqual({...thickness.getSize()},{width:64,height:1});
  const opticalTexels = thickness.getInternalTexture()._bufferView;
  assert(opticalTexels[0]>opticalTexels[32] && opticalTexels[63]>opticalTexels[32]);
  assert.equal(rear.isVisible,false);
  capture.onBeforeRenderObservable.notifyObservers(0);
  assert.equal(rear.isVisible,true);
  capture.onAfterRenderObservable.notifyObservers(0);
  assert.equal(rear.isVisible,false);
  assert.equal(caustic.isEnabled(),false);
  glass.setLayer('caustic',true);
  assert.equal(caustic.isEnabled(),true);
  glass.setLayer('fog',false);
  assert.equal(caustic.isEnabled(),true,'fog toggle does not alter caustic');
  assert.equal(foot.material.subSurface.maximumThickness,.115);
  assert.equal(rim.material.subSurface.maximumThickness,.034);
  checkVesselSwitch(scene,glass);
  scene.dispose();
  engine.dispose();
}
for (const opts of [{supportsHDR:false},{supportsHDR:true,forceLightweight:true}]) {
  const {engine,scene,glass} = fixture(opts);
  assert.equal(glass.highQuality,false);
  assert.equal(scene.customRenderTargets.length,0);
  assert.equal(scene.getMeshByName('Approximate tabletop caustic'),null);
  assert.equal(scene.getMeshByName('Polished foot').material.name,'Lightweight foot');
  checkVesselSwitch(scene,glass);
  scene.dispose();
  engine.dispose();
}
console.log('Glass ownership, calibration map, materials and both fallback paths passed.');
