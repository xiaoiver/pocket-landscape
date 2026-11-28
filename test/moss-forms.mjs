import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial} from '@babylonjs/core';
import {readMossPatches} from '../source/editor-moss.js';
import {createMossDetails} from '../source/moss-details.js';

const valid=[[0,.1],[.2,.1,'carpet'],[-.1,-.1,'cushion']];
assert.deepEqual(readMossPatches([...valid,[1,1,'carpet'],[0,0,'unknown'],[0,NaN],null],48),valid);
assert.deepEqual(readMossPatches(valid,2),valid.slice(0,2));
assert.deepEqual(readMossPatches(null,48),[]);

// In an edited copy the bank mask consumes matching matrix and tint records.
// Repeated rebuilds must start empty, including after erasing the last patch.
const engine=new NullEngine(), scene=new Scene(engine);
const details=createMossDetails(scene,new PBRMaterial('moss',scene));
for (const batch of Object.values(details)) {
  batch.add(.2,.4,.3,.07,.2,.1,.8);
  const first=batch.flush();
  assert.equal(first.matrices.length,16);
  assert.equal(first.colors.length,4);
  assert.ok(first.matrices.every(Number.isFinite));
  const empty=batch.flush();
  assert.equal(empty.matrices.length,0);
  assert.equal(empty.mesh.isEnabled(),false);
  batch.add(.2,.4,.3,.07,.2,.1,.8);
  assert.deepEqual(batch.flush().matrices,first.matrices);
}
scene.dispose();
engine.dispose();
