import { DynamicTexture, Texture } from '@babylonjs/core';

// Water map in physical pane coordinates (canvas Y points down). RG encodes
// the lens slope, B its thickness, and A its footprint. The sprite atlas is
// adapted from Lucas Bebber's drop-color and drop-alpha maps for Codrops.
const width = 1024, height = 480, sprite = 64, maxDrops = 150;

export function createWindowWater(scene, atlas) {
  const map = new DynamicTexture('Rain water map', {width,height}, scene, false, Texture.BILINEAR_SAMPLINGMODE);
  map.wrapU = map.wrapV = Texture.CLAMP_ADDRESSMODE;
  map.gammaSpace = false;
  const ctx = map.getContext();
  const fine = document.createElement('canvas');
  fine.width = width;
  fine.height = height;
  const bed = fine.getContext('2d');
  let drops = [], spawnBudget = 0, fineBudget = 0, fadeTime = 0, pending = 0;

  let wind = .09, gustTarget = .09, gustTime = 0;

  function stamp(context, x, y, rx, ry, depth) {
    context.drawImage(atlas, depth*sprite, 0, sprite, sprite, x-rx, y-ry, 2*rx, 2*ry);
  }
  function deposit() {
    const r = 1.2 + 3.0*Math.random()**2;
    stamp(bed, Math.random()*width, Math.random()*height, r, r*1.22, 0);
  }
  function newDrop(x,y,r) {
    return {x,y,r, speed:0, drift:0, stretch:0, pathPhase:Math.random()*2*Math.PI, grip:8+Math.random()*6,
      nextBead:6+Math.random()*13, life:10+Math.random()*28};
  }
  function step(dt) {
    // Sheltered glass gets short oblique gusts separated by quieter spells.
    gustTime -= dt;
    if (gustTime <= 0) {
      const gust = Math.random() < .56;
      gustTarget = gust ? .20 + .20*Math.random() : -.09 + .12*Math.random();
      gustTime = gust ? 1.1 + 1.6*Math.random() : 1.8 + 2.3*Math.random();
    }
    wind += (gustTarget-wind)*(1-Math.exp(-1.4*dt));
    fineBudget += dt*(64 + 48*Math.abs(wind));
    while (fineBudget >= 1) { deposit(); fineBudget--; }
    fadeTime += dt;
    if (fadeTime >= 1) {
      bed.globalCompositeOperation = 'destination-out';
      bed.fillStyle = 'rgba(0,0,0,.025)';
      bed.fillRect(0,0,width,height);
      bed.globalCompositeOperation = 'source-over';
      fadeTime = 0;
    }
    spawnBudget += dt*(5 + 8*Math.abs(wind));
    while (spawnBudget >= 1) {
      if (drops.length < maxDrops) {
        const squall = Math.random() < Math.max(0,wind)*.8;
        const radius = squall ? 9+7*Math.random() : 4+13*Math.random()**2.7;
        const drop = newDrop(Math.random()*width, Math.random()*height, radius);
        if (squall) {
          // A heavier impact arrives already sliding, with a few pinprick
          // beads scattered downwind. The smaller beads stick where they land.
          drop.speed = 18 + 35*Math.random();
          drop.drift = drop.speed*wind;
          for (let i=0; i<3; i++) {
            const r = 1.3+2*Math.random();
            stamp(bed, drop.x+radius*(.6+1.7*Math.random()),
              drop.y+radius*(Math.random()-.5)*2.5, r, r*1.22, 0);
          }
        }
        drop.stretch = .38;
        drops.push(drop);
      }
      spawnBudget--;
    }

    for (const d of drops) {
      d.life -= dt;
      if (d.life < 0 && d.r < d.grip) d.r = Math.max(0,d.r-.9*dt);
      d.stretch *= Math.exp(-8*dt);
      // A pinned contact line lets go intermittently. A moving drop needs
      // less weight to keep flowing than a resting drop needs to break free.
      if (!d.speed && d.r > d.grip && Math.random() < dt*(d.r-d.grip)*1.8) d.speed = 17;
      if (!d.speed) continue;
      const acceleration = (d.r - .76*d.grip)*33 - d.speed*.85;
      d.speed = Math.max(0, Math.min(240, d.speed + acceleration*dt));
      const distance = d.speed*dt, oldX = d.x, oldY = d.y;
      // Pinned beads resist the wind. Released beads follow it with inertia,
      // taking slightly different routes over the wetted glass.
      const slope = wind + .10*Math.sin(d.pathPhase + oldY*.043);
      d.drift += (d.speed*slope-d.drift)*(1-Math.exp(-3*dt));
      const side = d.drift*dt;
      d.x += side;
      d.y += distance;
      // The advancing head sweeps the fine mist aside. Deposit satellite
      // beads behind the swept tip only after it has travelled far enough.
      bed.globalCompositeOperation = 'destination-out';
      bed.lineCap = 'round';
      bed.lineWidth = d.r*.93;
      bed.strokeStyle = '#000';
      bed.beginPath(); bed.moveTo(oldX,oldY); bed.lineTo(d.x,d.y); bed.stroke();
      bed.globalCompositeOperation = 'source-over';
      const travel = Math.hypot(side,distance);
      d.nextBead -= travel;
      if (d.nextBead <= 0) {
        const r = d.r*(.15+.20*Math.random());
        const behind = d.r*1.3/travel;
        stamp(bed, d.x-side*behind+(Math.random()-.5)*d.r*.45,
          d.y-distance*behind, r,r*1.45,1);
        d.r = Math.sqrt(Math.max(0,d.r*d.r-r*r));
        d.nextBead = 5+Math.random()*d.r*1.8;
      }
    }

    // Largest first so each pair is consumed once. The tiny stationary beads
    // live on the persistent canvas and never enter this bounded pair search.
    drops.sort((a,b) => b.r-a.r);
    for (let i=0;i<drops.length;i++) {
      const a=drops[i];
      if (!a.r) continue;
      for (let j=i+1;j<drops.length;j++) {
        const b=drops[j], dx=b.x-a.x, dy=b.y-a.y;
        const reach=.73*(a.r+b.r);
        if (!b.r || dx*dx+dy*dy > reach*reach) continue;
        const area=b.r*b.r, total=a.r*a.r+area;
        a.x += dx*area/total;
        a.y += dy*area/total;
        a.r = Math.min(25,Math.sqrt(total));
        a.drift += dx*.95;
        if (a.r>a.grip) a.speed=Math.min(240,Math.max(a.speed,b.speed)+12+b.r*1.4);
        a.stretch=.3;
        b.r=0;
      }
    }
    drops = drops.filter(d => d.r>.5 && d.y<height+d.r*2 && d.x>-2*d.r && d.x<width+2*d.r);
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    ctx.drawImage(fine,0,0);
    for (const d of drops) {
      const depth=Math.min(7,Math.round(d.r/2.8));
      stamp(ctx,d.x,d.y,d.r*(1+d.stretch),d.r*(1.22+d.stretch+d.speed*.0018),depth);
    }
    map.update(true);
  }
  for(let i=0;i<1450;i++) deposit();
  for(let i=0;i<80;i++) drops.push(newDrop(Math.random()*width,Math.random()*height,3.5+13*Math.random()**2.6));
  for(let i=0;i<35;i++) step(1/30);
  draw();
  return {map, advance(dt) {
    pending+=Math.min(dt,.1);
    if(pending<1/30) return;
    while(pending>=1/30) { step(1/30); pending-=1/30; }
    draw();
  }};
}
