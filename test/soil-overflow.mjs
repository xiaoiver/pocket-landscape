import assert from 'node:assert/strict';
import {createLooseSoil} from '../source/loose-soil.js';
import {bowlLipAt} from '../source/slant-bowl.js';

const sum=xs=>xs.reduce((a,b)=>a+b,0), flat=()=>.46;
assert(bowlLipAt(Math.PI/2).y+.9<bowlLipAt(-Math.PI/2).y);
for (const [x,z,expectSpill] of [[0,1.24,true],[0,0,false],[0,-1.24,false]]) {
  const soil=createLooseSoil();
  for (let i=0;i<5;i++) soil.add(x,z,flat);
  const state=soil.serialize(),lost=sum(state.spilled);
  assert.equal(lost>0,expectSpill);
  assert(Math.abs(sum(state.depths)*(1.32/16)**2+lost-5*.082)<1e-8);
  assert(soil.depth(x,z)>0);
  const copy=createLooseSoil();
  copy.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(copy.serialize(),state);
  soil.erase(4);
  assert.equal(sum(soil.spilled),lost);
  assert(soil.serialize().depths.every(v=>v>=0));
}
console.log('Bowl outlet direction, fixed-volume soil transfer, erasure and restore passed.');
