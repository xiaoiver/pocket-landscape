import {VertexBuffer} from '@babylonjs/core';

// All authored moss layers are baked in landscape coordinates. The same small
// ground cells index the bank triangles, folded leaflets and instanced shoots.
const width = 128, span = 2.8, cellSize = span/width, brushRadius = .18;
const column = x => Math.min(width-1,Math.max(0,Math.floor((x+span/2)/cellSize)));
const cellAt = (x,z) => column(z)*width+column(x);

function maskFaces(mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices().slice();
  const cells = new Uint16Array(indices.length/3);
  for (let i=0; i<indices.length; i+=3) {
    const a=3*indices[i], b=3*indices[i+1], c=3*indices[i+2];
    cells[i/3] = cellAt((positions[a]+positions[b]+positions[c])/3,
      (positions[a+2]+positions[b+2]+positions[c+2])/3);
  }
  return erased => {
    const kept = [];
    for (let face=0; face<cells.length; face++) {
      if (!erased.has(cells[face])) kept.push(indices[3*face],indices[3*face+1],indices[3*face+2]);
    }
    mesh.setIndices(kept);
    mesh.setEnabled(kept.length>0);
  };
}

export function createPresetMoss({bank,rosettes,shoots}, saved) {
  const layers = [bank,rosettes].filter(Boolean);
  const masks = layers.map(maskFaces);
  let erased = new Set();
  function rebuild() {
    for (const apply of masks) apply(erased);
    if (!shoots) return;
    const {mesh,matrices,colors} = shoots, transforms=[], tints=[];
    for (let i=0; i<matrices.length; i+=16) {
      if (erased.has(cellAt(matrices[i+12],matrices[i+14]))) continue;
      transforms.push(...matrices.subarray(i,i+16));
      tints.push(...colors.subarray(i/4,i/4+4));
    }
    mesh.setEnabled(transforms.length>0);
    if (transforms.length) {
      mesh.thinInstanceSetBuffer('matrix',Float32Array.from(transforms),16,true);
      mesh.thinInstanceSetBuffer('color',Float32Array.from(tints),4,true);
    }
  }
  function restore(ids) {
    erased = new Set(Array.isArray(ids) ? ids.filter(i=>Number.isInteger(i) && i>=0 && i<width*width) : []);
    rebuild();
  }
  restore(saved);
  return {
    bank, layers, restore, serialize:() => [...erased],
    erase({x,z}) {
      const previous = erased.size;
      for (let row=column(z-brushRadius); row<=column(z+brushRadius); row++) {
        for (let col=column(x-brushRadius); col<=column(x+brushRadius); col++) {
          const dx=(col+.5)*cellSize-span/2-x, dz=(row+.5)*cellSize-span/2-z;
          if (dx*dx+dz*dz <= brushRadius**2) erased.add(row*width+col);
        }
      }
      if (erased.size===previous) return false;
      rebuild();
      return true;
    },
  };
}
