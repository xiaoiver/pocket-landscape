import {bowlLipAt,bowlShoulderHeight} from './slant-bowl.js';

const half=16, size=2*half+1, step=1.32/half, area=step*step;
const repose=.94, scoopVolume=.082;
export const spillSectors=48;
const cells=[], inside=new Uint8Array(size*size);
for (let j=0;j<size;j++) for (let i=0;i<size;i++) {
  const x=(i-half)*step,z=(j-half)*step,k=j*size+i;
  if (Math.hypot(x,z)>1.321) continue;
  inside[k]=1;
  cells.push({x,z,k});
}
for (const cell of cells) {
  const {x,z,k}=cell;
  cell.neighbors=[k-1,k+1,k-size,k+size].filter(n=>inside[n] && Math.abs(n%size-k%size)<=1);

  const angle=Math.atan2(z,x);
  const lip=bowlLipAt(angle);
  const distance=Math.hypot(x,z),lipRadius=Math.hypot(lip.x,lip.z);
  cell.ceiling=distance>lipRadius ? bowlShoulderHeight(x,z)-.015 : Infinity;
  cell.inward=cell.neighbors.reduce((best,n)=>{
    const radius=k=>Math.hypot(k%size-half,Math.floor(k/size)-half);
    return radius(n)<radius(best) ? n : best;
  },k);
  if (Math.abs(distance-lipRadius)>step*.7 && !(distance<lipRadius && cell.neighbors.length<4)) continue;
  // The soil mesh ends just inside the glass. Allow enough slope to bridge
  // the last fraction of a cell before material can clear the rolled rim.
  cell.outlet=lip.y+.019+repose*Math.max(0,lipRadius-distance);
  cell.sector=(Math.round(angle*spillSectors/(2*Math.PI))+spillSectors)%spillSectors;
}

export function createLooseSoil() {
  const depths=new Float64Array(size*size), spilled=new Float64Array(spillSectors);
  const marks=[];
  function restore(data) {
    function load(target,values) {
      target.fill(0);
      if (Array.isArray(values) && values.length===target.length && values.every(n=>Number.isFinite(n)&&n>=0&&n<100)) target.set(values);
    }
    load(depths,data?.depths);
    load(spilled,data?.spilled);
    marks.length=0;
    for (const p of (Array.isArray(data?.marks) ? data.marks.slice(0,72) : [])) {
      if (Array.isArray(p) && p.length===2 && p.every(Number.isFinite)) marks.push(p);
    }
  }
  function depth(x,z) {
    // Extend the last occupied cell to the circular edge. Sampling empty
    // grid corners here would carve a visible trench between soil and glass.
    const u=Math.min(size-1.00001,Math.max(0,x/step+half)),v=Math.min(size-1.00001,Math.max(0,z/step+half));
    const i=Math.floor(u),j=Math.floor(v),k=j*size+i,t=u-i,w=v-j;
    const weights=[(1-t)*(1-w),t*(1-w),(1-t)*w,t*w],indices=[k,k+1,k+size,k+size+1];
    let h=0,sum=0;
    for (let n=0;n<4;n++) if (inside[indices[n]]) {h+=weights[n]*depths[indices[n]];sum+=weights[n];}
    return sum ? h/sum : 0;
  }
  function add(x,z,baseHeight) {
    const ground=new Float64Array(depths.length),weights=new Float64Array(depths.length),capacity=new Float64Array(depths.length);
    const overflow=new Float64Array(spillSectors);
    let sum=0;
    for (const c of cells) {
      ground[c.k]=baseHeight(c.x,c.z);
      capacity[c.k]=Math.max(0,c.ceiling-ground[c.k]);
      weights[c.k]=Math.exp(-((c.x-x)**2+(c.z-z)**2)/.052);
      if (weights[c.k]<.00001) weights[c.k]=0;
      sum+=weights[c.k];
    }
    for (const {k} of cells) depths[k]+=weights[k]*scoopVolume/(area*sum);
    // Transfer equal volumes between neighboring columns. Only loose soil
    // moves; established terrain, roots and drainage stay in place.
    for (let pass=0;pass<100;pass++) {
      let largest=0;
      for (let i=0;i<cells.length;i++) {
        const {k,neighbors,outlet,sector,inward}=cells[pass%2 ? cells.length-1-i : i];
        // At the high back of the bowl the shoulder curves over the bed.
        // Deflect soil inward under the glass until it reaches open space.
        if (depths[k]>capacity[k] && inward!==k) {
          const over=depths[k]-capacity[k];
          depths[k]=capacity[k];depths[inward]+=over;largest=Math.max(largest,over);
        }
        for (const n of neighbors) {
          const excess=ground[k]+depths[k]-ground[n]-depths[n]-repose*step;
          if (excess<=.0001) continue;
          const transfer=Math.min(depths[k],Math.max(0,capacity[n]-depths[n]),excess*.48);
          depths[k]-=transfer;depths[n]+=transfer;
          largest=Math.max(largest,transfer);
        }
        if (outlet!==undefined) {
          const spill=Math.min(depths[k],Math.max(0,ground[k]+depths[k]-outlet));
          depths[k]-=spill;
          overflow[sector]+=spill*area;
          largest=Math.max(largest,spill);
        }
      }
      if (largest<.0001) break;
    }
    overflow.forEach((v,i)=>spilled[i]+=v);
    marks.push([x,z]);
    return overflow;
  }
  function erase(index) {
    const [x,z]=marks.splice(index,1)[0];
    // Lift one scoop from the nearest remaining loose material, without
    // pulling settled dirt on the table back through the glass.
    let left=scoopVolume/area;
    const distance=c=>(c.x-x)**2+(c.z-z)**2;
    const near=cells.filter(c=>depths[c.k]>0).sort((a,b)=>distance(a)-distance(b));
    for (const {k} of near) {
      const amount=Math.min(left,depths[k]);depths[k]-=amount;left-=amount;
      if (left<=0) break;
    }
    if (!marks.length) depths.fill(0);
  }
  return {depth,add,erase,marks,spilled,restore,serialize() {
    if (!marks.length && !spilled.some(Boolean) && !depths.some(Boolean)) return undefined;
    return {marks,depths:Array.from(depths),spilled:Array.from(spilled)};
  }};
}
