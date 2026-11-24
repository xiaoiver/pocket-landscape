import { ShaderMaterial } from '@babylonjs/core';

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
uniform float seconds;
varying vec2 paneUV;

float noiseAt(vec2 id) {
  vec3 p = fract(id.xyx * vec3(.1031,.1030,.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Local surface tilt, coverage and trailing film. Every column has its own
// offset and speed, while smaller pinned drops stay fixed to the glass.
vec4 droplets(vec2 uv, vec2 cells, float moving) {
  vec2 grid = uv * cells;
  float lane = noiseAt(vec2(floor(grid.x), 7.));
  grid.y += lane * 9. + moving * seconds * (.12 + .24*lane);
  vec2 id = floor(grid);
  float seed = noiseAt(id);
  vec2 center = vec2(.21+.58*noiseAt(id+13.), .30+.32*noiseAt(id+31.));
  vec2 d = fract(grid) - center;
  d.x += moving * .018 * sin(19.*uv.y + lane*37.);
  float radius = mix(.044,.15,seed*seed);
  vec2 axis = d / (radius * vec2(1., (cells.y/cells.x)*2.14*(1.15+.82*moving)));
  float r = length(axis);
  float cover = (1.-smoothstep(.77,1.05,r))*smoothstep(.18,.36,seed);
  float trail = moving * (1.-smoothstep(.008,.034,abs(d.x))) *
                smoothstep(.04,.16,d.y)*(1.-smoothstep(.27,.36,d.y))*seed;
  return vec4(axis*cover, cover, trail);
}

vec3 overcast(vec3 color) {
  float grey = dot(color,vec3(.24,.65,.11));
  return mix(vec3(grey), color, .30) * vec3(.49,.58,.65) + vec3(.012,.024,.030);
}

void main() {
  vec4 still = droplets(paneUV,vec2(61.,29.),0.);
  vec4 sliding = droplets(paneUV+vec2(.31,.19),vec2(28.,9.),1.);
  vec4 drop = sliding.z > still.z ? sliding : still;
  vec2 slope = drop.xy;
  vec3 outside = overcast(texture2D(garden,paneUV).rgb);
  vec2 refractedUV = clamp(paneUV - slope*vec2(.026,.060), .001,.999);
  vec3 refracted = overcast(texture2D(garden,refractedUV).rgb);
  float glint = exp(-13.*dot(slope-vec2(-.27,.51),slope-vec2(-.27,.51)));
  float lowerEdge = smoothstep(.08,.68,-slope.y);
  vec3 wet = refracted * (1.-.24*lowerEdge) + vec3(.14,.17,.19)*glint;
  gl_FragColor = vec4(mix(outside, wet, drop.z) + .028*sliding.w, 1.);
}`;

export function createRainGlazing(scene, garden) {
  const material = new ShaderMaterial('Rain on window glass', scene, {vertexSource, fragmentSource}, {
    attributes:['position','uv'], uniforms:['worldViewProjection','seconds'], samplers:['garden'],
  });
  material.setTexture('garden',garden);
  material.setFloat('seconds',0);
  return material;
}
