import {MaterialPluginBase, PBRMaterial} from '@babylonjs/core';

// Thin-leaf diffuse wrap, not glass transmission/refraction. Input is the scene's
// existing directional window light; the scan still provides the full leaf color.
class LeafBacklight extends MaterialPluginBase {
  constructor(material, sun) {
    super(material, 'Fittonia backlight', 215);
    this.sun = sun;
    this._enable(true);
  }

  getUniforms() {
    return {
      ubo: [{name:'leafLightDir',size:3,type:'vec3'}, {name:'leafLightStrength',size:1,type:'float'}],
      fragment: this._material.getScene().getEngine().supportsUniformBuffers ? '' : 'uniform vec3 leafLightDir; uniform float leafLightStrength;',
    };
  }

  bindForSubMesh(buffer) {
    const d=this.sun.direction;
    buffer.updateFloat3('leafLightDir',-d.x,-d.y,-d.z);
    buffer.updateFloat('leafLightStrength',this.sun.isEnabled()?Math.max(0,this.sun.intensity):0);
  }

  getCustomCode(stage) {
    if(stage!=='fragment')return null;
    return {CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
      #ifndef UNLIT
      vec3 toLeafLight=normalize(leafLightDir);
      float opposite=smoothstep(.04,.72,-dot(viewDirectionW,toLeafLight));
      float facing=smoothstep(.05,.75,-dot(normalW,toLeafLight));
      float shadowed=clamp(aggShadow,0.,1.);
      finalDiffuse += surfaceAlbedo * vec3(1.,.91,.78)
         * min(.084,.054*leafLightStrength)*opposite*facing*shadowed;
      #endif
    `};
  }
}

export function applyFittoniaLight(specimens, sun) {
  const leaf=specimens.find(mesh=>mesh.name==='Pink Angel Fittonia · harenil');
  if(!(leaf?.material instanceof PBRMaterial))return undefined;
  const original=leaf.material;
  const soft=original.clone('Pink Angel Fittonia · soft daylight');
  // Deliberately share the exact source scan texture (incl. release alpha state).
  soft.albedoTexture=original.albedoTexture;
  soft.roughness=Math.max(original.roughness??1,.88);
  soft.metallicF0Factor=.66;
  soft.specularIntensity=.70;
  new LeafBacklight(soft,sun);
  leaf.material=soft;
}
