import assert from 'node:assert/strict';
import {MeshBuilder,NullEngine,Scene,Vector3} from '@babylonjs/core';
import {createRockMoss} from '../source/rock-moss.js';

const scene=new Scene(new NullEngine());
scene.useRightHandedSystem=true;
const slab=MeshBuilder.CreateBox('outcrop',{width:.18,height:.25,depth:.48},scene);
const other=slab.clone('neighbor');
other.position.x=.245;
const moss=createRockMoss(scene,new Vector3(1,-.65,0).normalize());
const ground=()=>0;
function roots() {return moss.mesh.thinInstanceGetWorldMatrices().map(m=>m.getTranslation().asArray());}
moss.rebuild([slab],ground);
const original=roots();
const band=(points,left,right)=>points.filter(([x,,z])=>x>left && x<right && Math.abs(z)<.19).length;
assert.ok(band(original,.09,.15)>3*band(original,-.15,-.09),'the lee foot is denser');
moss.rebuild([slab,other],ground);
assert.ok(band(roots(),.09,.155)>band(original,.09,.155),'a second raised lip fills the gap');
moss.rebuild([slab],ground);
assert.deepEqual(roots(),original);
moss.rebuild([slab],ground,(x,z)=>z>0);
assert.ok(roots().every(([, ,z])=>z<=0));
slab.position.x=-.55;
moss.rebuild([slab],ground);
assert.ok(roots().every(([x])=>x<-.38));
moss.rebuild([slab],()=>.3);
assert.equal(moss.mesh.isEnabled(),false,'fully buried rock has no visible moss');
scene.getEngine().dispose();
