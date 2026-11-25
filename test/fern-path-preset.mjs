import assert from 'node:assert/strict';
import {Mesh, NullEngine, Scene, VertexBuffer, VertexData} from '@babylonjs/core';
import {indexPath} from '../source/preset-path.js';
import {samplePresetGround} from '../source/preset-ground.js';

const engine = new NullEngine();
const scene = new Scene(engine);
function mesh(name,positions,indices) {
  const result = new Mesh(name,scene);
  const data = new VertexData();
  data.positions=positions;
  data.indices=indices;
  data.applyToMesh(result);
  return result;
}

// A single stone can have duplicated vertices at a material or UV seam.
const path = mesh('path',[0,0,0, .1,0,0, 0,.1,0, 0,0,0, 0,.1,0, 0,0,.1,
  .3,0,0, .4,0,0, .3,.1,0],[0,1,2,3,4,5,6,7,8]);
const original = Array.from(path.getVerticesData(VertexBuffer.PositionKind));
const {pieces,faceKeys,flush}=indexPath(path);
assert.equal(pieces.length,2);
assert.equal(faceKeys[0],faceKeys[1]);
assert.notEqual(faceKeys[0],faceKeys[2]);
const first = pieces.find(p=>p.id===faceKeys[0]);
first.place(.2,.3,0,false);
flush();
const moved=path.getVerticesData(VertexBuffer.PositionKind);
assert(Math.abs(moved[0]-.2)<1e-6 && Math.abs(moved[1]-.3)<1e-6);
assert.deepEqual(Array.from(moved.slice(18)),original.slice(18).map(Math.fround));
first.place(0,0,0,true);
flush();
const removed=path.getVerticesData(VertexBuffer.PositionKind);
assert.deepEqual(removed.slice(0,3),removed.slice(3,6));
first.place(0,0,0,false);
flush();
assert.deepEqual(Array.from(path.getVerticesData(VertexBuffer.PositionKind)),original.map(Math.fround));

const slope=mesh('soil',[-1,.4,-1, 1,.8,-1, 1,.8,1, -1,.4,1],[0,1,2,0,2,3]);
const moss=mesh('moss',[-.2,.9,-.2, .2,.9,-.2, 0,.9,.2],[0,1,2]);
const height=samplePresetGround([slope,moss]);
assert(Math.abs(height(.5,0)-.7)<1e-5);
assert(Math.abs(height(0,0)-.9)<1e-5);
scene.dispose();
engine.dispose();
console.log('Individual authored stones, seam welding and planted surface heights passed.');
