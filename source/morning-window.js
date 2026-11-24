import { Color3, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core';

import { createRainGlazing } from './rain-glazing.js';

// One fixed casement behind the table. Keep the opening in local XY so a
// weather material can use continuous pane UVs behind the sash bars.
export function createMorningWindow(scene, camera) {
  const root = new TransformNode('Morning casement', scene);
  root.position.set(-.78, 0, -3.45);
  root.rotation.y = .24;

  function paint(name, color) {
    const material = new StandardMaterial(name, scene);
    const tint = Color3.FromHexString(color);
    material.diffuseColor = tint.scale(.34);
    material.emissiveColor = tint.scale(.56);
    material.specularColor = Color3.Black();
    return material;
  }
  const plaster = paint('Warm window reveal', '#b7b3aa');
  const timber = paint('Painted sash', '#c8c2b4');
  const beading = paint('Glazing bead', '#e3ded1');
  const recess = paint('Recessed sash seal', '#93958a');
  const pieces = new Map();
  function rail(material, x, y, z, width, height, depth) {
    const mesh = MeshBuilder.CreateBox('Joinery', {width, height, depth}, scene);
    mesh.position.set(x,y,z);
    if (!pieces.has(material)) pieces.set(material, []);
    pieces.get(material).push(mesh);
  }
  const width = 7.8, height = 3.65, bottom = .38, mid = bottom + height/2;
  const stileX = -.22, crossY = 1.84;
  // Plaster around the opening, with a stepped sill and square-cut reveals.
  for (const side of [-1,1]) {
    rail(plaster, side*(width/2+3), mid, -.10, 6, 10, .33);
    rail(timber, side*width/2, mid, .035, .16, height, .24);
  }
  rail(plaster, 0, bottom-.40, -.10, width, .80, .33);
  rail(plaster, 0, bottom+height+1.5, -.10, width, 3, .33);
  rail(timber, 0, bottom+.03, .06, width, .17, .25);
  rail(timber, 0, bottom+height, .035, width, .16, .24);
  rail(beading, 0, bottom-.07, .15, width+.29, .105, .53);
  rail(timber, 0, bottom-.16, .09, width+.16, .08, .33);
  // Raised faces with a darker rabbet. Offset their depths at the crossing.
  rail(recess, stileX, mid, -.032, .145, height, .075);
  rail(timber, stileX, mid, .05, .115, height, .13);
  rail(beading, stileX, mid, .12, .065, height, .014);
  rail(recess, 0, crossY, -.04, width, .102, .06);
  rail(timber, 0, crossY, .014, width, .08, .085);
  rail(beading, 0, crossY, .061, width, .047, .012);

  const meshes = [];
  for (const [material, parts] of pieces) {
    const merged = Mesh.MergeMeshes(parts, true);
    merged.name = material.name;
    merged.material = material;
    meshes.push(merged);
  }
  function panel(name, material, z) {
    const mesh = MeshBuilder.CreatePlane(name, {width, height}, scene);
    mesh.position.set(0, mid, z);
    mesh.rotation.y = Math.PI;
    mesh.material = material;
    meshes.push(mesh);
    return mesh;
  }
  const view = new StandardMaterial('Soft morning garden', scene);
  view.disableLighting = true;
  const photo = new Texture('data:image/jpeg;base64,' + document.getElementById('window-view').textContent, scene);
  photo.wrapU = photo.wrapV = Texture.CLAMP_ADDRESSMODE;
  view.diffuseTexture = photo;
  view.emissiveColor = Color3.White();
  panel('Garden beyond window', view, -.115);

  const glass = new StandardMaterial('Window glazing', scene);
  glass.diffuseColor = new Color3(.74,.84,.82);
  glass.specularColor = Color3.Black();
  glass.alpha = .055;
  const pane = panel('Window glass', glass, -.08);
  pane.alphaIndex = -1;
  const rainGlass = createRainGlazing(scene, photo);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let seconds = 0;
  for (const mesh of meshes) {
    mesh.parent = root;
    mesh.isPickable = false;
  }
  // An orbit can take the eye outside the room. Hide its cutaway wall
  // before it can sit between the camera and the terrarium.
  const inward = new Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
  scene.onBeforeRenderObservable.add(() => {
    const distance = Vector3.Dot(camera.position, inward) - Vector3.Dot(root.position, inward);
    root.setEnabled(distance > .32);
    if (root.isEnabled() && pane.material === rainGlass && !reducedMotion.matches) {
      seconds += Math.min(scene.getEngine().getDeltaTime(), 100) / 1000;
      rainGlass.setFloat('seconds', seconds);
    }
  });
  return {
    meshes,
    setRain(raining) {
      pane.material = raining ? rainGlass : glass;
    },
  };
}
