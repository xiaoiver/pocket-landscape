import {Matrix, VertexBuffer} from '@babylonjs/core';
import {prepareFoliage} from './foliage.js';
import {enableLeafPicking} from './leaf-picking.js';
import {glassInnerRadiusAt, vesselWalls} from './glass.js';

const varieties = {
  fern: {name:'Fern 02 · B', height:.77},
  fittonia: {name:'Pink Angel Fittonia · harenil', height:.46},
};
export const maxPlants = 16;

export function readPlants(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.filter(p => p && Object.hasOwn(varieties,p.kind) &&
    Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x,p.z)<=1.33 &&
    Number.isFinite(p.yaw)).slice(0,maxPlants);
}

export function createEditorPlants(scene, specimens, glass, shadows, heightAt, vessel, saved, useCopies=false) {
  const templates = new Map(), planted = new Map(), atlases = new Map();
  const sources = new Map(specimens.map(mesh => [mesh.name,mesh]));
  if (!useCopies) for (const mesh of specimens) mesh.setEnabled(false);
  for (const [kind, variety] of Object.entries(varieties)) {
    const source = sources.get(variety.name);
    const mesh = useCopies ? source.clone(kind+' planting template',null,true) : source;
    if (useCopies) {
      mesh.makeGeometryUnique();
      mesh.setEnabled(false);
      mesh.position.setAll(0);
      mesh.scaling.setAll(1);
    } else prepareFoliage(scene,[mesh]);
    // Specimens are baked into landscape coordinates. Recenter at the stems
    // near the soil line so turning the plant keeps its roots in place.
    const {minimum,maximum} = mesh.getBoundingInfo().boundingBox;
    const height = maximum.y-minimum.y, rootY = minimum.y + height*.04;
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind);
    let rootX = 0, rootZ = 0, count = 0;
    for (let i=0; i<vertices.length; i+=3) {
      if (vertices[i+1] > rootY) continue;
      rootX += vertices[i]; rootZ += vertices[i+2]; count++;
    }
    rootX /= count; rootZ /= count;
    mesh.bakeTransformIntoVertices(Matrix.Translation(-rootX,-rootY,-rootZ));
    const scale = variety.height/height;
    let radius = 0;
    const centered = mesh.getVerticesData(VertexBuffer.PositionKind);
    for (let i=0; i<centered.length; i+=3) radius = Math.max(radius,Math.hypot(centered[i],centered[i+2])*scale);
    templates.set(kind,{mesh,scale,radius,height:variety.height});
  }

  function settle(mesh, plant) {
    const {radius,height} = templates.get(plant.kind);
    const wall = vesselWalls[vessel.type];
    let x = plant.x, z = plant.z;
    // A move inward can put the roots higher on the slope. Recheck the crown
    // against the shoulder at the new elevation before setting the final pose.
    for (let i=0; i<6; i++) {
      const clearance = Math.min(1.32,glassInnerRadiusAt(heightAt(x,z)+height,wall)) - radius - .012;
      const distance = Math.hypot(x,z);
      if (distance <= clearance) break;
      x *= clearance/distance;
      z *= clearance/distance;
    }
    const y = heightAt(x,z);
    const headroom = vessel.type === 'bottle' ? Math.min(1,(1.96-y)/height) : 1;
    mesh.scaling.setAll(templates.get(plant.kind).scale*headroom);
    mesh.position.set(x,y,z);
  }
  function add(plant) {
    const {mesh:source} = templates.get(plant.kind);
    const mesh = source.clone('Planted '+plant.kind,null,true);
    mesh.parent = null;
    mesh.rotationQuaternion = null;
    mesh.rotation.set(0,plant.yaw,0);
    settle(mesh,plant);
    mesh.receiveShadows = true;
    mesh.setEnabled(true);
    glass.addContents?.([mesh]);
    shadows.addShadowCaster(mesh);
    enableLeafPicking(mesh,atlases);
    planted.set(mesh,plant);
  }
  function remove(mesh) {
    planted.delete(mesh);
    glass.removeContents?.([mesh]);
    shadows.removeShadowCaster(mesh);
    mesh.dispose();
  }
  for (const plant of saved) add(plant);
  return {
    planted,add,remove,
    settleAll() { for (const [mesh,plant] of planted) settle(mesh,plant); },
  };
}
