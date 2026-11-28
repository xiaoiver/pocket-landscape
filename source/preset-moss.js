import {VertexBuffer,VertexData} from '@babylonjs/core';

import {plantedX} from './path-route.js';
import {soilHeight} from './substrate.js';
import {colony} from './moss-cushions.js';

// All authored moss layers are baked in landscape coordinates. The same small
// ground cells index the bank triangles, folded leaflets and instanced shoots.
const width = 128, span = 2.8, cellSize = span/width, brushRadius = .18;
const column = x => Math.min(width-1,Math.max(0,Math.floor((x+span/2)/cellSize)));
const cellAt = (x,z) => column(z)*width+column(x);

// Extend the editable bank over the former gravel bed using its original moss
// material and UV scale. These triangles participate in picking and collision.
function extendBank(bank) {
  const patch=new VertexData();
  const positions=[],colors=[],uvs=[],indices=[];
  const rows=103,cols=25;
  for (let row=0;row<=rows;row++) for (let col=0;col<=cols;col++) {
    const z=-1.21+row*.0245, offset=(col/cols*2-1)*(.285+.045*z);
    const x=plantedX(z)+offset, r=Math.hypot(x,z);
    const feather=Math.min(1,(1-Math.abs(col/cols*2-1))*4,Math.max(0,(1.31-r)*18));
    const crown=colony(x,z), tone=.71+.30*crown;
    positions.push(x,soilHeight(x,z)-.012+feather*(.04+.087*crown),z);
    colors.push(tone*.83,tone,tone*.74,.4+.60*feather);
    uvs.push(x/.68+.04*Math.sin(-3*z),1-(-z/.68+.035*Math.sin(4*x)));
    if (!row || !col) continue;
    const d=row*(cols+1)+col,b=d-cols-1;
    if ([d,d-1,b,b-1].every(i=>Math.hypot(positions[3*i],positions[3*i+2])<1.306))
      indices.push(b-1,d-1,b,b,d-1,d);
  }
  const normals=[];
  VertexData.ComputeNormals(positions,indices,normals,{useRightHandedSystem:true});
  Object.assign(patch,{positions,normals,colors,uvs,indices});
  const data=VertexData.ExtractFromMesh(bank,true,true);
  data.merge(patch,true,true,false,true).applyToMesh(bank);
}

function maskFaces(mesh,originalFaces=Infinity) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices().slice();
  const cells = new Uint16Array(indices.length/3);
  for (let i=0; i<indices.length; i+=3) {
    const a=3*indices[i], b=3*indices[i+1], c=3*indices[i+2];
    cells[i/3] = cellAt((positions[a]+positions[b]+positions[c])/3,
      (positions[a+2]+positions[b+2]+positions[c+2])/3);
  }
  return (erased,rerouted) => {
    const kept = [];
    for (let face=0; face<(rerouted ? cells.length : Math.min(cells.length,originalFaces)); face++) {
      if (!erased.has(cells[face])) kept.push(indices[3*face],indices[3*face+1],indices[3*face+2]);
    }
    mesh.setIndices(kept);
    mesh.setEnabled(kept.length>0);
  };
}

export function createPresetMoss({bank,rosettes,shoots}, saved, route) {
  const layers = [bank,rosettes].filter(Boolean);
  const originalFaces=bank.getTotalIndices()/3;
  extendBank(bank);
  const masks=layers.map(mesh=>maskFaces(mesh,mesh===bank ? originalFaces : Infinity));
  let erased = new Set();
  let cleared = new Set();
  let rerouted=false;
  function setRoute(curve) {
    rerouted=Boolean(curve);
    cleared = new Set();
    // Rasterize the corridor once. All three moss layers sample the same footprint.
    for (const seg of curve?.segments ?? []) {
      const radius=.195-.045*seg.start/curve.length;
      const endX=seg.x+seg.tx*seg.span, endZ=seg.z+seg.tz*seg.span;
      for (let row=column(Math.min(seg.z,endZ)-radius);row<=column(Math.max(seg.z,endZ)+radius);row++) {
        for (let col=column(Math.min(seg.x,endX)-radius);col<=column(Math.max(seg.x,endX)+radius);col++) {
          const dx=(col+.5)*cellSize-span/2-seg.x, dz=(row+.5)*cellSize-span/2-seg.z;
          const t=Math.max(0,Math.min(seg.span,dx*seg.tx+dz*seg.tz));
          if ((dx-t*seg.tx)**2+(dz-t*seg.tz)**2<radius**2) cleared.add(row*width+col);
        }
      }
    }
  }
  function rebuild() {
    const hidden = new Set([...erased,...cleared]);
    for (const apply of masks) apply(hidden,rerouted);
    for (const batch of shoots) trimShoots(batch,hidden);
  }
  function trimShoots({mesh,matrices,colors},hidden) {
    const transforms=[],tints=[];
    for (let i=0; i<matrices.length; i+=16) {
      if (hidden.has(cellAt(matrices[i+12],matrices[i+14]))) continue;
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
  setRoute(route);
  restore(saved);
  return {
    bank, layers, restore, reroute(curve) {setRoute(curve);rebuild();},
    onPath:(x,z)=>cleared.has(cellAt(x,z)), erasedAt:(x,z)=>erased.has(cellAt(x,z)),
    serialize:() => [...erased],
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
