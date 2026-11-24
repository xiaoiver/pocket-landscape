import {
  Color3, Constants, Mesh, MeshBuilder, PBRMaterial, RenderTargetTexture,
  ShaderMaterial, Texture, Vector3,
} from '@babylonjs/core';

const VS = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 n;
varying vec3 p;
void main() {
  p = (world * vec4(position, 1.)).xyz;
  n = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.);
}`;

const FS = `
precision highp float;
varying vec3 n;
varying vec3 p;
uniform vec3 eye;
uniform float edge;
#ifdef HDR_WALL
uniform samplerCube reflection;
#endif
void main() {
  vec3 N = normalize(n);
  vec3 V = normalize(eye - p);
  float f = pow(1. - abs(dot(N,V)), 3.);
  vec3 r = reflect(-V,N);
  float a = atan(r.x,r.z);
  float strip = exp(-pow((a+.95)/.15,2.)) + .72*exp(-pow((a-1.33)/.045,2.));
  float h = smoothstep(.07,.19,p.y)*(1.-smoothstep(1.47,1.62,p.y));
  float b = clamp(strip*h,0.,1.);
  vec3 c = mix(vec3(.49,.57,.51),vec3(1.,.995,.96),max(b,clamp(r.y*1.2+.2,0.,1.)*edge));
#ifdef HDR_WALL
  // Use the same right-handed cube direction as the PBR reflection path.
  vec3 light = textureCube(reflection, vec3(r.xy, -r.z)).rgb;
  vec3 highlight = pow(light / (1. + light), vec3(1./2.2));
  float peak = clamp(max(max(highlight.r,highlight.g),highlight.b),0.,1.);
  c = mix(c, highlight, .32 + .22 * f);
  // A thin wall should hardly obscure the scene, except at the silhouette and softboxes.
  float opacity = .005 + f * (.14 + .13 * peak) + b * .115;
#else
  float opacity = .014 + f*.29 + b*.20 + edge*(.19+.28*f);
#endif
  gl_FragColor = vec4(c, opacity);
}`;

const WALL = [[1.315,.08],[1.34,.12],[1.351,.24],[1.367,1.39],[1.366,1.43]];
const FOOT = [[1.22,.030],[1.295,.021],[1.332,.041],[1.345,.066],[1.346,.095],[1.333,.115],[1.299,.123],[1.24,.105]];
const LIP = Array.from({length:21}, (_, i) => {
  const a = i * Math.PI / 10;
  return [1.365 + .017*Math.cos(a), 1.43 + .018*Math.sin(a)];
});

function profile(scene, name, shape, alphaIndex) {
  const mesh = MeshBuilder.CreateLathe(name, {
    shape: shape.map(([r,y]) => new Vector3(r,y,0)),
    tessellation: 160,
    sideOrientation: Mesh.FRONTSIDE,
  }, scene);
  mesh.isPickable = false;
  mesh.alphaIndex = alphaIndex;
  return mesh;
}

function overlay(scene, name, edge, hdr) {
  const m = new ShaderMaterial(name, scene, {vertexSource:VS, fragmentSource:FS}, {
    attributes:['position','normal'],
    uniforms:['world','worldViewProjection','eye','edge'],
    samplers: hdr ? ['reflection'] : [],
    defines: hdr ? ['#define HDR_WALL'] : [],
    needAlphaBlending:true,
  });
  m.backFaceCulling = !hdr ? false : true;
  m.setFloat('edge', edge);
  if (hdr) m.setTexture('reflection', hdr);
  return m;
}

function transmission(scene, name, hdr, capture, thickness, roughness, mix) {
  const m = new PBRMaterial(name, scene);
  m.metallic = 0;
  m.roughness = roughness;
  m.albedoColor = Color3.White();
  m.reflectionTexture = hdr;
  // Babylon also applies scene.environmentIntensity to screen transmission.
  // Restore neutral transmission for these materials without relighting plants / table.
  m.environmentIntensity = 1 / Math.max(scene.environmentIntensity, .1);
  m.backFaceCulling = true;
  m.subSurface.isRefractionEnabled = true;
  m.subSurface.refractionTexture = capture;
  m.subSurface.useThicknessAsDepth = true;
  // An untextured material uses max-min, not min, for its actual optical depth.
  m.subSurface.minimumThickness = 0;
  m.subSurface.maximumThickness = thickness;
  m.subSurface.indexOfRefraction = 1.46;
  m.subSurface.tintColor = new Color3(.95,.99,.975);
  m.subSurface.tintColorAtDistance = .85;
  // Mix a bounded amount of the optical pass over the unchanged background.
  // The whole result comes from the captured image; use plain alpha, not linked transmission.
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.useRadianceOverAlpha = false;
  m.useSpecularOverAlpha = false;
  m.alpha = mix;
  return m;
}

export function installGlass(scene, camera, hdr, contents, forceLightweight = false) {
  const engine = scene.getEngine();
  const caps = engine.getCaps();
  const wall = profile(scene, 'Clear handblown wall', WALL, 1);
  const foot = profile(scene, 'Polished foot', FOOT, 2);
  const rim = profile(scene, 'Rounded glass lip', LIP, 3);
  // Explicitly prefer the original single-pass glass on cramped / coarse-pointer devices.
  const useCapture = !forceLightweight && engine.webGLVersion > 1 &&
    caps.textureHalfFloatRender && caps.textureHalfFloatLinearFiltering;
  if (!useCapture) {
    const materials = [overlay(scene,'Lightweight wall',0), overlay(scene,'Lightweight foot',.88), overlay(scene,'Lightweight lip',.88)];
    [wall.material, foot.material, rim.material] = materials;
    return { update: () => { for (const m of materials) m.setVector3('eye', camera.position); } };
  }

  // Capture only the table/shadow and both planting variants, never the refractive meshes.
  // Disabled meshes are skipped at render time; the capture list survives planting switches.
  // Keep the same camera and aspect as the main canvas, but use 1/4 the pixels.
  const size = () => ({
    width: Math.max(1, Math.round(engine.getRenderWidth(true) * .5)),
    height: Math.max(1, Math.round(engine.getRenderHeight(true) * .5)),
  });
  const capture = new RenderTargetTexture('Glass contents', size(), scene, {
    generateMipMaps:false, type:Constants.TEXTURETYPE_HALF_FLOAT,
    samplingMode:Texture.BILINEAR_SAMPLINGMODE, generateDepthBuffer:true,
    gammaSpace:false,
  });
  capture.activeCamera = camera;
  capture.ignoreCameraViewport = true;
  capture.useCameraPostProcesses = false;
  capture.disableImageProcessing = true;
  capture.coordinatesMode = Texture.PROJECTION_MODE;
  capture.lodGenerationScale = 0;
  capture.lodGenerationOffset = 0;
  capture.renderList = contents.slice();

  // Single front wall overlay, with an oppositely wound, reflection-only rear surface.
  // The rear surface has no capture sampler, so there is no feedback cycle.
  const inner = profile(scene, 'Reflection-only inner wall', WALL.map(([r,y]) => [r-.008,y]).reverse(), 1);
  const rear = overlay(scene, 'Rear glass reflection', 0, hdr);
  inner.material = rear;
  inner.isVisible = false;
  capture.renderList.push(inner);
  capture.onBeforeRenderObservable.add(() => { inner.isVisible = true; });
  capture.onAfterRenderObservable.add(() => { inner.isVisible = false; });
  // PBR already registers this shared render target. Adding it to customRenderTargets
  // would capture twice per main frame (separate material and custom target passes).
  const front = overlay(scene,'Front glass reflection',0,hdr);
  wall.material = front;
  foot.material = transmission(scene, 'Thick optical foot', hdr, capture, .115, .030, .46);
  rim.material = transmission(scene, 'Rolled optical rim', hdr, capture, .034, .021, .49);
  return {
    update() {
      front.setVector3('eye', camera.position);
      rear.setVector3('eye', camera.position);
    },
    resize() {
      const next = size();
      if (capture.getRenderWidth() !== next.width || capture.getRenderHeight() !== next.height) capture.resize(next);
    },
  };
}
