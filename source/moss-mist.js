import { Color3, Mesh, RawTexture, ShaderMaterial, Texture, VertexData } from '@babylonjs/core';

const radius = 1.26;

// R stores soil elevation; G stores moisture in the two planted banks.
// Blender's horizontal Y axis becomes negative world Z on glTF export.
function bankMap(scene) {
  const size = 96;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = radius * (2 * (col + .5) / size - 1);
      const z = radius * (2 * (row + .5) / size - 1);
      const soil = .60 + .14*(1-z) + .13*Math.exp(-4*((x+.65)**2+(z+.07)**2))
        + .075*Math.sin(3*x-z)*Math.cos(4*z);
      const left = Math.exp(-((x+.54)**2/.28 + (z-.08)**2/.44));
      const right = Math.exp(-((x-.52)**2/.25 + (z+.31)**2/.32));
      const i = (row*size+col)*4;
      pixels[i] = Math.round(255 * (soil-.25));
      pixels[i+1] = Math.round(255 * Math.max(left, .82*right));
      pixels[i+3] = 255;
    }
  }
  const map = RawTexture.CreateRGBATexture(pixels,size,size,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE;
  map.gammaSpace = false;
  return map;
}

export function createMossMist(scene, lightweight) {
  const slices = lightweight ? 12 : 20;
  const mesh = new Mesh('Low mist over moss', scene);
  mesh.position.y = .82;
  mesh.alphaIndex = .75;
  mesh.isPickable = false;
  const data = new VertexData();
  data.positions = [];
  data.indices = [];
  for (let i = 0; i < slices; i++) {
    const z = 2*(i+.5)/slices-1;
    data.positions.push(-1,-1,z, 1,-1,z, 1,1,z, -1,1,z);
    const v = i*4;
    data.indices.push(v,v+1,v+2, v,v+2,v+3);
  }
  data.applyToMesh(mesh);
  mesh.alwaysSelectAsActiveMesh = true; // The vertex shader orients slices in view space.
  const vertexSource = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 world, view, projection;
    varying vec3 samplePos;
    varying float stepLength;
    void main() {
      mat3 basis = mat3(view);
      vec3 halfSize = vec3(${radius}, .48, ${radius});
      vec3 span = abs(basis[0])*halfSize.x + abs(basis[1])*halfSize.y + abs(basis[2])*halfSize.z;
      vec3 offset = position*span;
      vec3 center = world[3].xyz;
      samplePos = center + offset*basis;
      stepLength = span.z * ${2/slices};
      gl_Position = projection * (view*vec4(center,1.) + vec4(offset,0.));
    }`;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D bank;
    uniform float density;
    uniform vec3 tint;
    varying vec3 samplePos;
    varying float stepLength;
    void main() {
      float edge = 1.-smoothstep(.90,${radius},length(samplePos.xz));
      vec2 ground = texture2D(bank,.5+.5*samplePos.xz/${radius}).rg;
      float h = samplePos.y - (.25+ground.r);
      float layer = smoothstep(.008,.075,h)*(1.-smoothstep(.09,.30,h));
      float alpha = density * edge * ground.g * layer * stepLength;
      gl_FragColor = vec4(tint, alpha);
    }`;
  const material = new ShaderMaterial('Shallow bank mist',scene,{vertexSource,fragmentSource},{
    attributes:['position'], uniforms:['world','view','projection','density','tint'],
    samplers:['bank'], needAlphaBlending:true,
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setTexture('bank',bankMap(scene));
  mesh.material = material;
  const morning = new Color3(.82,.80,.67), rainy = new Color3(.57,.64,.64);
  function setRain(raining) {
    material.setFloat('density',raining ? .44 : .070);
    material.setColor3('tint',raining ? rainy : morning);
  }
  setRain(false);
  return {mesh,setRain};
}
