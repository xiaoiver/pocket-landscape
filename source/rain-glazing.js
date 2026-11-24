import { createWindowWater } from './window-water.js';
import { ShaderMaterial, Texture } from '@babylonjs/core';

const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 paneUV;
void main() {
  paneUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.);
}`;

const fragmentSource = `
precision highp float;
uniform sampler2D garden;
uniform sampler2D detail;
uniform sampler2D water;
varying vec2 paneUV;

vec3 overcast(vec3 color) {
  float grey = dot(color,vec3(.24,.65,.11));
  return mix(vec3(grey), color, .30) * vec3(.425,.50,.565) + vec3(.010,.019,.025);
}

void main() {
  vec4 lens = texture2D(water,paneUV);
  vec3 outside = overcast(texture2D(garden,paneUV).rgb);
  // Map axes follow the Codrops sprite: green bends horizontally; red is
  // measured down the image, opposite the pane's upward V coordinate.
  vec2 bend = (lens.gr*2.-1.) * vec2(1.,-1.);
  vec2 ray = vec2(paneUV.x, mix(paneUV.y,.52,.42)) + bend*vec2(.34,.85)*(.55+.45*lens.b);
  vec3 inside = overcast(texture2D(detail,clamp(ray,.001,.999)).rgb);
  // The curved lower lip catches the pale sky. Its extent follows the
  // sampled water normal, so a newly spread drop has a different rim.
  float skyRim = smoothstep(.10,.40,bend.y) * clamp(.82+.6*bend.x,0.,1.);
  inside = mix(inside,outside,.22) + vec3(.18,.20,.21)*skyRim;
  float coverage = smoothstep(.19,.63,lens.a);
  gl_FragColor = vec4(mix(outside,inside*1.05,coverage),1.);
}`;

export async function createRainGlazing(scene, garden) {
  const atlas = new Image();
  atlas.src = 'data:image/png;base64,' + document.getElementById('drop-atlas').textContent;
  await atlas.decode();
  const detail = new Texture('data:image/jpeg;base64,' + document.getElementById('window-detail').textContent, scene);
  detail.wrapU = detail.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new ShaderMaterial('Rain on window glass', scene, {vertexSource, fragmentSource}, {
    attributes:['position','uv'], uniforms:['worldViewProjection'], samplers:['garden','detail','water'],
  });
  material.setTexture('garden',garden);
  material.setTexture('detail',detail);
  let water;
  return {
    wetMaterial() {
      if (!water) {
        water = createWindowWater(scene,atlas);
        material.setTexture('water',water.map);
      }
      return material;
    },
    advance(seconds) { water?.advance(seconds); },
  };
}
