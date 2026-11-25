import {MaterialPluginBase} from '@babylonjs/core';

class MineralRoughness extends MaterialPluginBase {
  constructor(material) {
    super(material,'Matte mineral grain',220);
    this._enable(true);
  }
  getCustomCode(stage) {
    if (stage!=='fragment') return null;
    return {CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:
      'metallicRoughness.g = mix(metallicRoughness.g, 1.0, .32);'};
  }
}

export function softenPebbleGloss(material) {
  material.metallicF0Factor=.68;
  if (material.metallicTexture) new MineralRoughness(material);
  else material.roughness=.88;
}
