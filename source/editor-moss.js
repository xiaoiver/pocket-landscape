import {Matrix, Quaternion, Vector3} from '@babylonjs/core';
import {createMossTuft} from './moss-cushions.js';

export function createEditorMoss(scene, patches, heightAt) {
  const mesh = createMossTuft(scene);
  const origin = new Vector3(), scale = new Vector3(), spin = new Quaternion(), transform = new Matrix();
  function rebuild() {
    mesh.setEnabled(patches.length > 0);
    if (!patches.length) return;
    const matrices = [];
    for (const [cx,cz] of patches) {
      const phase = cx*19 + cz*13;
      for (let i=0;i<270;i++) {
        const a = i*2.39996 + phase;
        const r = .19*Math.sqrt(i/270) * (1+.13*Math.cos(3*a+phase));
        const x = cx+r*Math.cos(a), z = cz+r*Math.sin(a);
        if (Math.hypot(x,z)>1.306) continue;
        const thickness = 1.05 + .36*Math.sin(i*19+phase) + .46*(1-r/.21);
        origin.set(x,heightAt(x,z)-.005,z);
        scale.set(thickness,thickness,thickness);
        Quaternion.RotationYawPitchRollToRef(a,.12*Math.cos(a),.12*Math.sin(a),spin);
        Matrix.ComposeToRef(scale,spin,origin,transform);
        matrices.push(...transform.m);
      }
    }
    mesh.thinInstanceSetBuffer('matrix',Float32Array.from(matrices),16,true);
  }
  rebuild();
  return {mesh,rebuild};
}
