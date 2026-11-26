import {Vector3} from '@babylonjs/core';

// A spherical wall cut by a plane facing the front of the desk (+Z).
// The flat heel shares the planting bed's existing footprint.
const radius=1.44, centerY=.96, startAngle=1.94, mouthAngle=.965, tilt=.74;
function meridian(angle) {
  return [radius*Math.sin(angle),centerY+radius*Math.cos(angle)];
}
const lower=[[1.315,.08],[1.34,.12],[1.351,.24],[1.348,.35]];
function arc(end) {
  return [...lower,...Array.from({length:41},(_,i)=>meridian(startAngle+(end-startAngle)*i/40))];
}
export const bowlWall=arc(mouthAngle);
export const bowlEnvelope=arc(mouthAngle-tilt);

// Progressively tilt the latitude rings on the same sphere. The mouth and
// its rolled lip share one rigid tilt while the soil and heel stay level.
export function tiltBowlMesh(mesh,lip=false) {
  const positions=mesh.getVerticesData('position'), normals=mesh.getVerticesData('normal');
  for (let i=0;i<positions.length;i+=3) {
    const y=positions[i+1]-centerY;
    const latitude=Math.acos(Math.max(-1,Math.min(1,y/radius)));
    const angle=lip ? tilt : tilt*Math.max(0,Math.min(1,(startAngle-latitude)/(startAngle-mouthAngle)));
    const c=Math.cos(angle),s=Math.sin(angle),z=positions[i+2];
    positions[i+1]=centerY+c*y-s*z;
    positions[i+2]=s*y+c*z;
    const ny=normals[i+1],nz=normals[i+2];
    normals[i+1]=c*ny-s*nz;
    normals[i+2]=s*ny+c*nz;
  }
  mesh.setVerticesData('position',positions);
  mesh.setVerticesData('normal',normals);
}

// Fit the actual fronds to the upper spherical wall. A single bounding box
// includes empty corners above the canopy and would shrink the planting.
export function fitBowlFoliage(meshes,originalWorld,x,y,z,dx,dy,dz) {
  const ax=x+dx,ay=y+dy-centerY,az=z+dz;
  const inner=radius-.02, anchorSquared=ax*ax+ay*ay+az*az;
  const point=new Vector3();
  let scale=1;
  for (const [index,mesh] of meshes.entries()) {
    const vertices=mesh.getVerticesData('position');
    for (let i=0;i<vertices.length;i+=3) {
      Vector3.TransformCoordinatesFromFloatsToRef(vertices[i],vertices[i+1],vertices[i+2],originalWorld[index],point);
      const vx=point.x-x,vy=point.y-y,vz=point.z-z;
      const px=ax+vx*scale,py=ay+vy*scale,pz=az+vz*scale;
      if (py<=0 || px*px+py*py+pz*pz<=inner*inner) continue;
      // Intersection of the ray from the planted base through this leaf tip.
      const along=ax*vx+ay*vy+az*vz, lengthSquared=vx*vx+vy*vy+vz*vz;
      if (lengthSquared>0) scale=Math.min(scale,Math.max(0,
        (Math.sqrt(Math.max(0,along*along+lengthSquared*(inner*inner-anchorSquared)))-along)/lengthSquared));
    }
  }
  return scale;
}

// Intersection of a horizontal radial ray with the projected circular lip.
export function bowlLipAt(angle) {
  const [r,y]=bowlWall.at(-1);
  const c=Math.cos(tilt),s=Math.sin(tilt),dx=Math.cos(angle),dz=Math.sin(angle);
  const offset=(y-centerY)*s;
  const a=dx*dx+dz*dz/(c*c),b=offset*dz/(c*c);
  const distance=(b+Math.sqrt(b*b+a*(r*r-offset*offset/(c*c))))/a;
  return {x:distance*dx,z:distance*dz,y:centerY+(y-centerY-s*distance*dz)/c};
}

export function bowlShoulderHeight(x,z) {
  return centerY+Math.sqrt(Math.max(0,radius*radius-x*x-z*z));
}
