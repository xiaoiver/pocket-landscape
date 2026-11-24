import {MaterialPluginBase, PBRMaterial, Texture} from '@babylonjs/core';

// Modulate only dielectric roughness, not RGB, alpha, geometry, lighting or glass.
// A broken mask follows the existing drainage crest over a narrow contact zone.
class ContactRoughness extends MaterialPluginBase {
  constructor(material, soil) {
    super(material,'Substrate contact roughness',210);
    this.soil=soil;
    this._enable(true);
  }

  getCustomCode(stage) {
    if (stage!=='fragment') return null;
    return {CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
      vec2 contactXZ = vPositionW.xz;
      float contactAngle = atan(contactXZ.y, contactXZ.x);
      float contactCenter = .185 + .018*sin(5.0*contactAngle+.45) + .011*sin(11.0*contactAngle+.7);
      float contactBand = 1.0 - smoothstep(.012,.066,abs(vPositionW.y-contactCenter));
      float contactWall = smoothstep(1.17,1.28,length(contactXZ));
      float contactPatch = smoothstep(.23,.70,.5+.30*sin(9.0*contactAngle+.7)+.20*sin(17.0*contactAngle));
      float contact = contactBand*contactWall*contactPatch;
      ${this.soil ? 'metallicRoughness.g = mix(.97,metallicRoughness.g,.25);' : ''}
      metallicRoughness.g = max(.72,metallicRoughness.g-${this.soil ? '.14' : '.10'}*contact);
    `};
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
  const rockContact=rocks.clone('Drainage gravel · original tones and damp contacts');
  // Preserve the existing albedo of both materials. The maps only affect the soil.
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
  new ContactRoughness(rockContact,false);
  return {setEnabled(active) {
    earth.material=active ? soilContact : soil;
    gravel.material=active ? rockContact : rocks;
  }};
}
