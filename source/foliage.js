import {Color3, MaterialPluginBase, PBRMaterial, RawTexture, Texture, Vector3, VertexBuffer} from '@babylonjs/core';

// Retain the painted roughness variation but soften the small, sharp
// highlights that the imported ORM maps give unglazed clay.
class ClayFinish extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Terracotta finish', 214);
    this._enable(true);
  }
  getCustomCode(stage) {
    return stage === 'fragment' ? {CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:
      'metallicRoughness.g = mix(.84,metallicRoughness.g,.24);'} : null;
  }
}

export function prepareClay(material) {
  if (!(material instanceof PBRMaterial) || material.pluginManager?.getPlugin('Terracotta finish')) return;
  material.specularIntensity = .52;
  new ClayFinish(material);
}

// Both Fern 02 clumps share one cutout atlas. At 32:1 minification the
// original 0.5 threshold holds its area; at 64:1 the measured threshold is 0.45.
class FernCoverage extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Fern leaflet coverage', 215);
    this._enable(true);
  }
  getCustomCode(stage) {
    if (stage !== 'fragment') return null;
    return {CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
      #if __VERSION__ >= 300 && defined(ALBEDO) && defined(ALPHATEST)
        vec2 fernTexel = vAlbedoUV * vec2(textureSize(albedoSampler, 0));
        float footprint = max(length(dFdx(fernTexel)), length(dFdy(fernTexel)));
        alpha *= 1. + .14 * smoothstep(28., 85., footprint);
      #endif
    `};
  }
}

// The authored leaves run from edge to edge along U, with their midrib at 0.5.
// Scans use separate atlas islands, so this mask belongs only to procedural leaves.
function bladeMask(scene) {
  const width = 128;
  const rgba = new Uint8Array(width*4).fill(255);
  for (let i = 0; i < width; i++) {
    const across = Math.abs(2*(i+.5)/width - 1);
    const rib = Math.exp(-((across/.085)**2));
    rgba[i*4+3] = Math.round(255*(.68 + .32*across - .42*rib));
  }
  const mask = RawTexture.CreateRGBATexture(rgba,width,1,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
  mask.name = 'Leaf blade · diffuse transmission mask';
  mask.gammaSpace = false;
  mask.wrapU = mask.wrapV = Texture.CLAMP_ADDRESSMODE;
  return mask;
}

function velvet(material, intensity) {
  material.sheen.isEnabled = true;
  material.sheen.intensity = intensity;
  material.sheen.roughness = .78;
  material.sheen.color = new Color3(.75,.77,.62);
}

// Each baked fern has its own vertex buffer, but the two share one material.
// Ease card normals toward the crown without changing their facing or the scanned normal map.
function softenFern(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions || !normals) return;
  const {minimum, maximum} = mesh.getBoundingInfo().boundingBox;
  const height = maximum.y-minimum.y;
  const width = Math.max(maximum.x-minimum.x, maximum.z-minimum.z);
  if (height <= 0 || width <= 0) return;
  const root = Vector3.Zero();
  let count = 0;
  for (let i=0; i<positions.length; i+=3) {
    if (positions[i+1] > minimum.y+.10*height) continue;
    root.x += positions[i];
    root.z += positions[i+2];
    count++;
  }
  if (!count) return;
  root.scaleInPlace(1/count);
  const colors = new Float32Array(positions.length/3*4);
  const crown = Vector3.Zero(), normal = Vector3.Zero();
  for (let i=0; i<positions.length; i+=3) {
    const x = (positions[i]-root.x)/width, z = (positions[i+2]-root.z)/width;
    const y = (positions[i+1]-minimum.y)/height;
    const openness = 1-Math.exp(-16*(x*x+z*z)-8*y*y);
    crown.set(x,.30+.50*y,z).normalize();
    Vector3.FromArrayToRef(normals,i,normal);
    if (Vector3.Dot(normal,crown)<0) crown.negateInPlace();
    Vector3.LerpToRef(normal,crown,.16*openness,normal);
    normal.normalize().toArray(normals,i);
    const light = .73+.27*openness;
    colors.set([light,light,light,1],i/3*4);
  }
  mesh.setVerticesData(VertexBuffer.NormalKind,normals);
  mesh.setVerticesData(VertexBuffer.ColorKind,colors);
}

export function prepareFoliage(scene, meshes) {
  const seen = new Set();
  let mask;
  for (const mesh of meshes) {
    const fern = mesh.name.startsWith('Fern 02');
    if (fern) softenFern(mesh);
    const m = mesh.material;
    if (!(m instanceof PBRMaterial) || seen.has(m)) continue;
    seen.add(m);
    const name = mesh.name;
    const scan = name.startsWith('Pink Angel Fittonia');
    const canopy = name.startsWith('Canopy ');
    const fittonia = scan || name.startsWith('Fittonia ·');
    const mossTips = name === 'Living moss · rosettes';

    if (name.startsWith('Woodland outcrop')) m.roughness = .76;
    if (!(fern || canopy || fittonia || mossTips)) {
      // The closed props and the upward-facing ground use their exterior normals.
      // Keep the imported culling mode on legacy card meshes.
      if (/^(Earth ·|River gravel |Woodland outcrop|Weathered granite|Fox ·|Cushion moss · continuous bank)/.test(name)) {
        m.backFaceCulling = true;
        m.twoSidedLighting = false;
      }
      continue;
    }
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    if (mossTips) {
      velvet(m,.10);
      continue;
    }
    const tissue = m.subSurface;
    tissue.isTranslucencyEnabled = true;
    // Tint direct backlight as well as HDR irradiance with the original leaf pigment.
    tissue.translucencyColorTexture = m.albedoTexture;
    tissue.translucencyIntensity = fern ? .29 : .19;
    tissue.translucencyColor = fittonia ? new Color3(1,.85,.78) : new Color3(.82,1,.62);
    tissue.maximumThickness = .10;
    if (canopy || (fittonia && !scan)) {
      mask ??= bladeMask(scene);
      tissue.translucencyIntensityTexture = mask;
    }
    if (fern) {
      m.clearCoat.isEnabled = true;
      m.clearCoat.intensity = .10;
      m.clearCoat.roughness = .37;
      new FernCoverage(m);
    } else if (fittonia) {
      m.roughness = scan ? .88 : .73;
      m.specularIntensity = .55;
      m.enableSpecularAntiAliasing = true;
      m.metallicF0Factor = .60;
      velvet(m,scan ? .025 : .08);
    } else {
      m.roughness = .66;
      m.metallicF0Factor = .72;
    }
  }
}
