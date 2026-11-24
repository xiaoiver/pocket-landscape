import {
  Color3, Constants, Mesh, MeshBuilder, PBRMaterial, RawTexture, RenderTargetTexture,
  ShaderMaterial, Texture, Vector2, Vector3,
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
#ifdef OPTICAL_WALL
uniform sampler2D contents;
uniform sampler2D thicknessMap;
uniform mat4 view;
uniform vec2 screenSize;
uniform vec2 viewScale;
uniform float opticalScale;
uniform float absorptionScale;
uniform float fogOn;
uniform float dropsOn;
uniform float dropTime;
float hash(float n) { return fract(sin(n*127.1 + 7.2)*43758.5453); }
float dropShape(float a, float y, out vec2 offset) {
  // Wrapped cylindrical cells: the pattern meets cleanly at the Lathe seam.
  float ua = (a / 6.28318530718 + .5)*23.;
  float id = floor(ua);
  float h = hash(id);
  float drifts = step(.73,hash(id+19.));
  float travel = fract(hash(id+9.) - dropTime*(.012+.014*h));
  float height = mix(.53+.78*hash(id+9.), .52+.79*travel, drifts);
  vec2 field = vec2((fract(ua) - (.22+.56*h))*.36, y-height);
  float fade = mix(1.,smoothstep(0.,.09,travel)*(1.-smoothstep(.91,1.,travel)),drifts);
  float isOn = step(.46, hash(id + 14.)) * smoothstep(.3,.52,y)*fade;
  vec2 drop = field / vec2(.012+.012*h,.020+.032*h);
  float profile = 1. - smoothstep(.63, 1.1, length(drop));
  float trail = (1.-smoothstep(.014,.030,abs(field.x))) *
    smoothstep(-.19,-.035,field.y) * (1.-smoothstep(-.035,.005,field.y));
  offset = clamp(drop, vec2(-1.), vec2(1.))*profile;
  return isOn*max(profile,.24*trail);
}
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
#ifdef OPTICAL_WALL
  // Project the bounded bend into the current viewport, not the smaller RTT.
  float y = clamp((p.y-.08)/1.35,0.,1.);
  float mapValue = texture2D(thicknessMap,vec2(y,.5)).r;
  float incidence = max(dot(N,V),.12);
  float path = mix(.018,.048,mapValue)/incidence*opticalScale;
  vec2 uv = gl_FragCoord.xy/screenSize;
  vec2 limit = 2./screenSize;
  vec3 direction = refract(-V,N,1./1.46);
  vec3 straight = (view*vec4(-V,0.)).xyz;
  vec3 bent = (view*vec4(direction,0.)).xyz;
  vec2 bend = clamp((bent.xy - straight.xy)*(.14*path)*viewScale,vec2(-.011),vec2(.011));
  float azimuth = atan(p.x,p.z);
  vec2 dropNormal = vec2(0.);
  float drop = 0.;
  if (dropsOn > .5) drop = dropShape(azimuth,p.y,dropNormal);
  // Thin condensation concentrated at the top; smooth low-frequency world-space ripples.
  float mist = 0.;
  if (fogOn > .5) {
    float mottling = .48 + .30*sin(9.*azimuth+2.7*p.y) + .15*sin(15.*azimuth-9.*p.y);
    mist = smoothstep(.81,.99,y)*(.31+.69*clamp(mottling,0.,1.));
  }
  vec2 sampleUV = clamp(uv+bend+dropNormal*drop*.006,limit,1.-limit);
  vec3 transmitted = max(texture2D(contents,sampleUV).rgb,vec3(0.));
  if (mist > .01) {
    vec2 spread = vec2(.0032,.002) * mist;
    transmitted = .5*transmitted + .25*max(texture2D(contents,clamp(sampleUV+spread,limit,1.-limit)).rgb,vec3(0.)) +
      .25*max(texture2D(contents,clamp(sampleUV-spread,limit,1.-limit)).rgb,vec3(0.));
  }
  // Beer–Lambert: transmission attenuates with optical path; red attenuates
  // faster than green, especially near the curved silhouette and thicker base.
  transmitted *= exp(-vec3(1.10,.21,.68)*path*absorptionScale);
  transmitted = pow(transmitted,vec3(1./2.2));
  float f5 = pow(1.-incidence,5.);
  float glint = drop*max(0.,-dropNormal.y)*.22;
  vec3 glass = mix(transmitted,c,.03+.32*f5+.18*b);
  glass = mix(glass,vec3(.90,.94,.89),.27*mist+glint);
  float valid = smoothstep(.001,.024,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
  float optical = (.14+.34*f5+.21*mist+.26*drop)*valid;
  // Combine the original HDR silhouette + weak centered transmission without
  // drawing an additional wall. The center remains largely direct view.
  float combined = optical + opacity*(1.-optical);
  gl_FragColor = vec4((glass*optical+c*opacity*(1.-optical))/max(combined,.001),combined);
#else
  gl_FragColor = vec4(c, opacity);
#endif
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

function overlay(scene, name, edge, hdr, optics) {
  const m = new ShaderMaterial(name, scene, {vertexSource:VS, fragmentSource:FS}, {
    attributes:['position','normal'],
    uniforms:['world','worldViewProjection','eye','edge', ...(optics ? [
      'view','screenSize','viewScale','opticalScale','absorptionScale','fogOn','dropsOn','dropTime',
    ] : [])],
    samplers: optics ? ['reflection','contents','thicknessMap'] : hdr ? ['reflection'] : [],
    defines: optics ? ['#define HDR_WALL','#define OPTICAL_WALL'] : hdr ? ['#define HDR_WALL'] : [],
    needAlphaBlending:true,
  });
  m.backFaceCulling = !hdr ? false : true;
  m.setFloat('edge', edge);
  if (hdr) m.setTexture('reflection', hdr);
  if (optics) {
    m.setTexture('contents', optics.capture);
    m.setTexture('thicknessMap', optics.thickness);
    m.setFloat('opticalScale',1);
    m.setFloat('absorptionScale',1);
  }
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

function wallThickness(scene) {
  const calibrated = Uint8Array.from({length:64}, (_,i) => {
    const y = i / 63;
    // A thick heel, a thin middle, then gradually thicker glass into the rolled lip.
    return Math.round(255 * Math.min(1, .17 + .81*Math.exp(-y*8) + .49*y**8));
  });
  const tex = RawTexture.CreateRTexture(
    calibrated,64,1,scene,false,false,Texture.BILINEAR_SAMPLINGMODE,Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  tex.name = 'Calibrated optical wall thickness';
  tex.gammaSpace = false;
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

function caustic(scene, sunlight) {
  const pocket = MeshBuilder.CreateGround('Approximate tabletop caustic',{width:4,height:4},scene);
  pocket.position.y = .008;
  pocket.isPickable = false;
  pocket.alphaIndex = .5;
  const fragment = `
precision highp float;
varying vec3 p;
uniform vec2 lightDir;
void main() {
  vec2 shifted = p.xz - lightDir*.29;
  vec2 uv = vec2(dot(shifted,lightDir),dot(shifted,vec2(-lightDir.y,lightDir.x)));
  vec2 q = vec2(uv.x*.74,uv.y);
  float r = length(q);
  float sector = smoothstep(-.13,.89,uv.x);
  float line = exp(-pow((r-1.21)/.046,2.));
  float halo = exp(-pow((r-1.24)/.124,2.));
  float wave = .76+.24*cos(8.*atan(q.y,q.x));
  gl_FragColor = vec4(1.,.965,.84,(.125*line+.024*halo)*sector*wave);
}`;
  const mat = new ShaderMaterial('Analytic caustic luminance',scene,{vertexSource:VS,fragmentSource:fragment},{
    attributes:['position','normal'],uniforms:['world','worldViewProjection','lightDir'],needAlphaBlending:true,
  });
  mat.disableDepthWrite = true;
  mat.alphaMode = Constants.ALPHA_ADD;
  pocket.material = mat;
  const lightDir = new Vector2();
  function update() {
    lightDir.set(sunlight?.direction.x ?? .82,sunlight?.direction.z ?? -.70);
    if (lightDir.lengthSquared() < .0001) lightDir.set(1,0);
    lightDir.normalize();
    mat.setVector2('lightDir',lightDir);
  }
  update();
  return {pocket,update};
}

export function installGlass(scene, camera, hdr, contents, {forceLightweight = false, sunlight, layers = {}, animateDrops = true} = {}) {
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
    return { highQuality:false, update: () => { for (const m of materials) m.setVector3('eye', camera.position); } };
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
  const thickness = wallThickness(scene);
  const effect = caustic(scene,sunlight);
  capture.renderList.push(effect.pocket);
  const front = overlay(scene,'Front glass optics',0,hdr,{capture,thickness});
  const state = {fog:layers.fog ?? true,drops:layers.drops ?? true,caustic:layers.caustic ?? true};
  function setLayer(layer, active) {
    if (!Object.hasOwn(state,layer)) return;
    state[layer] = active;
    front.setFloat('fogOn',state.fog ? 1 : 0);
    front.setFloat('dropsOn',state.drops ? 1 : 0);
    effect.pocket.setEnabled(state.caustic);
  }
  for (const [layer,active] of Object.entries(state)) setLayer(layer,active);
  const screenSize = new Vector2(), viewScale = new Vector2();
  let dropTime = 0;
  wall.material = front;
  foot.material = transmission(scene, 'Thick optical foot', hdr, capture, .115, .030, .46);
  rim.material = transmission(scene, 'Rolled optical rim', hdr, capture, .034, .021, .49);
  return {
    highQuality:true, setLayer,
    update() {
      const projection = camera.getProjectionMatrix().m;
      viewScale.set(projection[0],projection[5]);
      screenSize.set(engine.getRenderWidth(true),engine.getRenderHeight(true));
      front.setVector2('screenSize',screenSize);
      front.setVector2('viewScale',viewScale);
      front.setVector3('eye', camera.position);
      rear.setVector3('eye', camera.position);
      if (state.drops && animateDrops) dropTime += Math.min(engine.getDeltaTime(),70)/1000;
      front.setFloat('dropTime',dropTime);
      if (state.caustic) effect.update();
    },
    resize() {
      const next = size();
      if (capture.getRenderWidth() !== next.width || capture.getRenderHeight() !== next.height) capture.resize(next);
    },
  };
}
