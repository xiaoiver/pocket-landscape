import {MaterialPluginBase, PBRMaterial, Texture} from '@babylonjs/core';

// Height of the authored planted bank in Babylon world coordinates.
export function soilHeight(x, z) {
  return .60 + .14*(1-z) + .13*Math.exp(-4*((x+.65)**2+(z+.07)**2))
    + .075*Math.sin(3*x-z)*Math.cos(4*z);
}

// Both the soil and its moss skirt must settle together, or buried moss faces
// become visible at the rim. Keep the pebble path seated at the front opening.
export function settleSoilShoulder(p) {
  const r = Math.hypot(p.x, p.z);
  if (r <= 1.25 || p.y < .30) return;
  const ease = value => {
    const t = Math.min(1, Math.max(0, value));
    return t*t*(3-2*t);
  };
  const path = .08 + .40*Math.sin((.45-p.z)*2.8);
  const rim = ease((r-1.25)/.07) * ease((Math.abs(p.x-path)-.18)/.12);
  const a = Math.atan2(p.z,p.x);
  const broken = .5 + .25*Math.sin(17*a+1.6*Math.sin(8*a)) + .25*Math.sin(37*a+.7);
  const top = ease((p.y-soilHeight(p.x,p.z)+.15)/.138);
  const radius = r - rim*(.005 + .014*broken + top*.010);
  p.x *= radius/r;
  p.z *= radius/r;
  p.y -= rim*top*(.017 + .046*broken);
}

// A damp contact darkens the diffuse response and softens the roughness together.
// A broken mask follows the existing drainage crest over a narrow contact zone.
class ContactRoughness extends MaterialPluginBase {
  constructor(material, soil) {
    super(material,'Substrate contact roughness',210);
    this.soil=soil;
    this._enable(true);
  }

  getCustomCode(stage) {
    if (stage!=='fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        float dampStoneContact(vec3 p) {
          float a = atan(p.z,p.x);
          float center = .192+.022*sin(5.*a+.45)+.013*sin(11.*a+.7);
          float band = 1.-smoothstep(.015,.077,abs(p.y-center));
          float dampPatch = smoothstep(.19,.76,.5+.3*sin(9.*a+.7)+.2*sin(17.*a+26.*p.y));
          return band * smoothstep(1.16,1.28,length(p.xz)) * dampPatch;
        }
      `,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        ${this.soil ? `
          float fold = sin(dot(vPositionW.xz,vec2(5.3,7.1)) + 1.4*sin(vPositionW.z*9.));
          float humus = smoothstep(.20,.68,vPositionW.y + .070*fold + .024*sin(vPositionW.x*19.));
          surfaceAlbedo *= mix(vec3(.59,.63,.66),vec3(1.09,1.04,.97),humus);
        ` : ''}
        surfaceAlbedo *= 1.-${this.soil ? '.13' : '.26'}*dampStoneContact(vPositionW);
      `,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
        ${this.soil ? 'metallicRoughness.g = mix(.97,metallicRoughness.g,.25);' : ''}
        metallicRoughness.g = max(.43,metallicRoughness.g-${this.soil ? '.14' : '.21'}*dampStoneContact(vPositionW));
      `,
    };
  }
}

// The baked humus color and normals share one grain profile. The roughness
// map is adapted from Brown Mud Rocks 01 (Poly Haven, CC0).
export function prepareSubstrate(scene, earth, gravel) {
  if (!(earth?.material instanceof PBRMaterial)) return undefined;
  const normal = document.getElementById('substrate-humus-normal')?.textContent.trim();
  const roughness = document.getElementById('substrate-roughness')?.textContent.trim();
  const pigment = document.getElementById('substrate-humus')?.textContent.trim();
  if (!pigment || !normal || !roughness) return undefined;
  const load = (data, strength = 1) => {
    const texture = new Texture('data:image/jpeg;base64,'+data,scene,false,false);
    texture.gammaSpace=false;
    texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;
    texture.uScale=1.05;
    texture.vScale=.72;
    texture.anisotropicFilteringLevel=4;
    texture.level=strength;
    return texture;
  };
  const soil=earth.material, rocks=gravel.material;
  const soilContact=soil.clone('Soil · humus and damp contacts');
  // The drainage stones already share the path’s baked mineral maps.
  soilContact.albedoTexture=load(pigment);
  soilContact.albedoTexture.gammaSpace=true;
  soilContact.bumpTexture=load(normal,.88);
  soilContact.invertNormalMapX=!scene.useRightHandedSystem;
  soilContact.invertNormalMapY=scene.useRightHandedSystem;
  soilContact.metallicTexture=load(roughness);
  soilContact.metallic=0;
  soilContact.roughness=1;
  soilContact.useRoughnessFromMetallicTextureAlpha=false;
  soilContact.useRoughnessFromMetallicTextureGreen=true;
  soilContact.useMetallnessFromMetallicTextureBlue=false;
  soilContact.useAmbientOcclusionFromMetallicTextureRed=false;
  new ContactRoughness(soilContact,true);
  new ContactRoughness(rocks,false);
  return {setEnabled(active) {
    earth.material=active ? soilContact : soil;
  }};
}
