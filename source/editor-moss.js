import {Matrix, Quaternion, Vector3} from '@babylonjs/core';
import {plantedX} from './path-route.js';
import {createMossTuft,colony} from './moss-cushions.js';

export function createEditorMoss(scene, patches, heightAt, pathBed) {
  const mesh = createMossTuft(scene);
  const origin = new Vector3(), scale = new Vector3(), spin = new Quaternion(), transform = new Matrix();
  function rebuild() {
    const matrices = [];
    function shoot(x,z,a,thickness) {
      if (Math.hypot(x,z)>1.306 || pathBed?.onPath(x,z)) return;
      origin.set(x,heightAt(x,z)-.005,z);
      scale.setAll(thickness);
      Quaternion.RotationYawPitchRollToRef(a,.12*Math.cos(a),.12*Math.sin(a),spin);
      Matrix.ComposeToRef(scale,spin,origin,transform);
      matrices.push(...transform.m);
    }
    // Fill the exposed old path with the same folded shoots used by the moss brush.
    if (pathBed?.edited()) {
      for (let row=0;row<122;row++) for (let col=-11;col<=11;col++) {
        const a=row*19.3+col*7.9, z=1.29-row*.021+.008*Math.sin(a);
        const offset=col*.021+.008*Math.cos(a);
        if (Math.abs(offset)>.18+.045*z+.02*Math.sin(z*12)) continue;
        const x=plantedX(z)+offset;
        if (!pathBed.erasedAt(x,z)) shoot(x,z,a,.75+.49*colony(x,z)+.24*Math.cos(a));
      }
    }
    for (const [cx,cz] of patches) {
      const phase = cx*19 + cz*13;
      for (let i=0;i<270;i++) {
        const a = i*2.39996 + phase;
        const r = .19*Math.sqrt(i/270) * (1+.13*Math.cos(3*a+phase));
        const x = cx+r*Math.cos(a), z = cz+r*Math.sin(a);
        shoot(x,z,a,1.05 + .36*Math.sin(i*19+phase) + .46*(1-r/.21));
      }
    }
    mesh.setEnabled(matrices.length>0);
    if (matrices.length) mesh.thinInstanceSetBuffer('matrix',Float32Array.from(matrices),16,true);
  }
  rebuild();
  return {mesh,rebuild};
}
