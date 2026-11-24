import { MaterialPluginBase, PBRMaterial, RawTexture, Texture } from '@babylonjs/core';

// Local accents fitted to components of woodland.glb intersecting the earth surface.
// Each entry is [world x, ground y, world z, x/z falloff radius, strength].
const contacts = [
  [.390,.631,.580,.168,.168,.29], // Fox body, near the ground
  [.376,.584,.787,.068,.074,.25], // Front foot
  [.546,.580,.711,.069,.072,.22], // Other foot; nearby moss rises to it
  [-.543,.728,.526,.134,.103,.26], // Left near granite
  [.610,.787,.101,.172,.214,.27], // Right large granite
  [.719,.733,.278,.091,.114,.22], // Right lower granite
  [-.411,.696,.812,.063,.075,.18], // A few path stones at moss edge
  [-.455,.682,.853,.059,.059,.18],
  [-.426,.655,.950,.066,.064,.17],
];
const side = 128, origin = [-.74,-.16], span = [1.66,1.34];

function makeMap(scene) {
  const rgba = new Uint8Array(side*side*4);
  for(let row=0;row<side;row++) for(let col=0;col<side;col++){
    const x=origin[0]+span[0]*(col+.5)/side;
    const z=origin[1]+span[1]*(row+.5)/side;
    let shadow=0, weightedHeight=0, mass=0;
    for(const [cx,y,cz,rx,rz,strength] of contacts){
      const d2=((x-cx)/rx)**2+((z-cz)/rz)**2;
      const weight=strength*Math.max(0,1-d2)**2;
      shadow=Math.max(shadow,weight);
      weightedHeight+=weight*y; mass+=weight;
    }
    const i=(row*side+col)*4;
    rgba[i]=Math.round(255*shadow);
    rgba[i+1]=mass>0 ? Math.round(255*weightedHeight/mass) : 0;
    rgba[i+3]=255;
  }
  const tex=RawTexture.CreateRGBATexture(rgba,side,side,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
  tex.name='Local ambient contact accents';
  tex.gammaSpace=false; tex.wrapU=tex.wrapV=Texture.CLAMP_ADDRESSMODE;
  return tex;
}

class GroundContact extends MaterialPluginBase {
  constructor(material, map) {
    super(material,'Ground contact accents',222,{GROUND_CONTACTS:false});
    this.map=map;
    this._enable(true);
  }
  prepareDefines(defines) { defines.GROUND_CONTACTS=true; }
  getSamplers(samplers) { samplers.push('groundContactsMap'); }
  bindForSubMesh(buffer) {
    buffer.setTexture('groundContactsMap',this.map);
  }
  getCustomCode(stage) {
    if(stage!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:'#ifdef GROUND_CONTACTS\nuniform sampler2D groundContactsMap;\n#endif',
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
        #ifdef GROUND_CONTACTS
        {
          vec2 contactUv=(vPositionW.xz-vec2(${origin[0]},${origin[1]}))/vec2(${span[0]},${span[1]});
          vec2 groundContact=texture2D(groundContactsMap,contactUv).rg;
          float contactMask=groundContact.r*(1.-smoothstep(.037,.142,abs(vPositionW.y-groundContact.g)));
          // Keep existing highlights and direct shadows; favor ambient/indirect occlusion.
          finalAmbient *= 1.-contactMask;
          finalDiffuse *= 1.-.58*contactMask;
          #if defined(REFLECTION) && !defined(UNLIT)
          finalIrradiance *= 1.-contactMask;
          #endif
        }
        #endif
      `,
    };
  }
}

export function prepareGroundContacts(scene, base) {
  const map=makeMap(scene);
  const attached=new Set();
  function attach(material){
    if(!(material instanceof PBRMaterial)||attached.has(material))return;
    new GroundContact(material,map);
    material.markAsDirty(PBRMaterial.AllDirtyFlag);
    attached.add(material);
  }
  for(const mesh of base){
    if(/^(Earth · planted bank|River gravel |Cushion moss )/.test(mesh.name))attach(mesh.material);
  }
  return {attach};
}
