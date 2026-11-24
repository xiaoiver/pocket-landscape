import {MaterialPluginBase, PBRMaterial, Texture} from '@babylonjs/core';

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
        surfaceAlbedo *= 1.-${this.soil ? '.13' : '.26'}*dampStoneContact(vPositionW);
      `,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
        ${this.soil ? 'metallicRoughness.g = mix(.97,metallicRoughness.g,.25);' : ''}
        metallicRoughness.g = max(.43,metallicRoughness.g-${this.soil ? '.14' : '.21'}*dampStoneContact(vPositionW));
      `,
    };
  }
}

// Brown Mud Rocks 01 · Poly Haven · CC0. Sources are embedded by build.cjs.
export function prepareSubstrate(scene, earth, gravel) {
  if (!(earth?.material instanceof PBRMaterial)) return undefined;
  const normal = document.getElementById('substrate-normal')?.textContent.trim();
  const roughness = document.getElementById('substrate-roughness')?.textContent.trim();
  if (!normal || !roughness) return undefined;
  const load = (data, strength = 1) => {
    const texture = new Texture('data:image/jpeg;base64,'+data,scene,false,false);
    texture.gammaSpace=false;
    texture.wrapU=texture.wrapV=Texture.WRAP_ADDRESSMODE;
    texture.uScale=texture.vScale=3;
    texture.anisotropicFilteringLevel=4;
    texture.level=strength;
    return texture;
  };
  const soil=earth.material, rocks=gravel.material;
  const soilContact=soil.clone('Soil · subtle texture and damp contacts');
  // The drainage stones already share the path’s baked mineral maps.
  soilContact.bumpTexture=load(normal,.18);
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
