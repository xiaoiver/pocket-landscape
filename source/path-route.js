// Blender's planting uses Y along the bed; in the exported landscape this is -Z.
export const plantedX = z => .08 + .40*Math.sin((.45-z)*2.8);
export const plantedRoute = Array.from({length:9},(_,i) => {
  const z = 1.26 - i*2.44/8;
  return [plantedX(z),z];
});
export const maxRoutePoints = 48;
export function insideBed(x,z,radius=1.29) {
  const scale = Math.min(1,radius/(Math.hypot(x,z) || 1));
  return [x*scale,z*scale];
}
export function readRoute(points) {
  if (!Array.isArray(points) || points.length<2 || points.length>maxRoutePoints ||
      !points.every(p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite) && Math.hypot(...p)<1.34)) return;
  if (points.some(p=>Math.hypot(p[0]-points[0][0],p[1]-points[0][1])>.08)) return points;
}

export function measureRoute(knots) {
  const segments=[];
  let length=0;
  for (let i=0;i<knots.length-1;i++) {
    const p=knots[i], q=knots[i+1], prev=knots[i-1] ?? p, next=knots[i+2] ?? q;
    const steps=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/.035));
    let [x,z]=p;
    for (let j=1;j<=steps;j++) {
      const t=j/steps, u=1-t;
      const point=p.map((v,k)=>u*u*(1+2*t)*v+t*t*(3-2*t)*q[k]+
        .5*t*u*(u*(q[k]-prev[k])-t*(next[k]-v)));
      const [nx,nz]=insideBed(...point,1.32);
      const dx=nx-x,dz=nz-z,span=Math.hypot(dx,dz);
      if (span>1e-6) {
        segments.push({x,z,tx:dx/span,tz:dz/span,span,start:length,knot:i});
        length+=span;
      }
      x=nx; z=nz;
    }
  }
  return {segments,length};
}

export function nearestOnRoute(route,x,z) {
  let best, distance=Infinity;
  for (const seg of route.segments) {
    const dx=x-seg.x,dz=z-seg.z;
    const along=Math.max(0,Math.min(seg.span,dx*seg.tx+dz*seg.tz));
    const px=seg.x+along*seg.tx, pz=seg.z+along*seg.tz;
    const d=(x-px)**2+(z-pz)**2;
    if (d<distance) {
      distance=d;
      best={x:px,z:pz,knot:seg.knot,t:(seg.start+along)/route.length,
        side:dx*(-seg.tz)+dz*seg.tx};
    }
  }
  return best;
}
export function stoneOnRoute(route,{t,side},radius) {
  const along=t*route.length;
  let lo=0, hi=route.segments.length-1;
  while (lo<hi) {
    const mid=(lo+hi)>>1, seg=route.segments[mid];
    if (seg.start+seg.span<along) lo=mid+1;
    else hi=mid;
  }
  const s=route.segments[lo], d=along-s.start;
  return insideBed(s.x+s.tx*d-s.tz*side,s.z+s.tz*d+s.tx*side,1.315-radius);
}
export const originalCurve=measureRoute(plantedRoute);
