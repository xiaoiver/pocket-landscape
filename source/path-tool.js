import {Matrix,Vector3} from '@babylonjs/core';
import {insideBed,maxRoutePoints,measureRoute,plantedRoute,readRoute} from './path-route.js';
import {wording} from './interface-language.js';

export function installPathTool(scene,canvas,heightAt,getRoute,applyRoute,finish) {
  const guide=document.getElementById('path-guide'), ctx=guide.getContext('2d');
  const actions=document.getElementById('path-actions'), redraw=document.getElementById('redraw-path');
  const hint=actions.querySelector('span'), bendHint=hint.textContent;
  let visible=false, drawing=false, gesture;
  function setDrawing(value) {
    drawing=value;
    redraw.setAttribute('aria-pressed',String(value));
    hint.textContent=value ? wording('在土面上一笔画出新路','Draw a new path across the soil') : bendHint;
  }
  function knots() {return gesture?.points ?? getRoute() ?? plantedRoute;}
  function ground(event) {
    const rect=canvas.getBoundingClientRect();
    const ray=scene.createPickingRay(event.clientX-rect.left,event.clientY-rect.top,Matrix.IdentityReadOnly,scene.activeCamera);
    // March only the planted volume. Intersect the editor height field even under foliage.
    if (ray.direction.y>=-.001) return;
    const start=Math.max(0,(1.95-ray.origin.y)/ray.direction.y), end=(.32-ray.origin.y)/ray.direction.y;
    let last=start;
    for (let d=start;d<=end;last=d,d+=.022) {
      const x=ray.origin.x+d*ray.direction.x, z=ray.origin.z+d*ray.direction.z;
      if (Math.hypot(x,z)>1.34 || ray.origin.y+d*ray.direction.y>heightAt(x,z)) continue;
      let lo=last,hi=d;
      for (let j=0;j<6;j++) {
        const m=(lo+hi)/2;
        if (ray.origin.y+m*ray.direction.y>heightAt(ray.origin.x+m*ray.direction.x,ray.origin.z+m*ray.direction.z)) lo=m;
        else hi=m;
      }
      return insideBed(ray.origin.x+hi*ray.direction.x,ray.origin.z+hi*ray.direction.z);
    }
  }
  function project(x,z) {
    const camera=scene.activeCamera, view=camera.viewport.toGlobal(canvas.clientWidth,canvas.clientHeight);
    return Vector3.Project(new Vector3(x,heightAt(x,z)+.018,z),Matrix.IdentityReadOnly,scene.getTransformMatrix(),view);
  }
  function draw() {
    if (!visible) return;
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio || 1,2);
    if (guide.width!==Math.round(w*dpr) || guide.height!==Math.round(h*dpr)) {
      guide.width=Math.round(w*dpr); guide.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const points=knots(), curve=measureRoute(points);
    if (curve.length) {
      const left=[],right=[];
      ctx.beginPath();
      for (const [i,s] of curve.segments.entries()) {
        const a=project(s.x,s.z), b=project(s.x+s.tx*s.span,s.z+s.tz*s.span);
        if (!i) ctx.moveTo(a.x,a.y);
        ctx.lineTo(b.x,b.y);
        if (gesture) {
          const width=.195-.045*s.start/curve.length;
          left.push(project(s.x-s.tz*width,s.z+s.tx*width));
          right.push(project(s.x+s.tz*width,s.z-s.tx*width));
        }
      }
      ctx.lineJoin='round';ctx.lineCap='round';
      ctx.lineWidth=3.5;ctx.strokeStyle='rgba(45,57,37,.8)';ctx.stroke();
      ctx.lineWidth=1.5;ctx.strokeStyle='#fff6ce';ctx.stroke();
      if (gesture) {
        ctx.beginPath();
        for (const [i,p] of left.concat(right.reverse()).entries()) {
          if (!i) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.closePath();ctx.fillStyle='rgba(255,240,186,.24)';ctx.fill();
      }
    }
    for (const [i,p] of points.entries()) {
      const v=project(...p);
      ctx.beginPath();ctx.arc(v.x,v.y,i===gesture?.index?5.5:4,0,Math.PI*2);
      ctx.fillStyle='#fff7dc';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#394f37';ctx.stroke();
    }
  }
  const observer=scene.onAfterRenderObservable.add(draw);
  function cancel() {
    const id=gesture?.id;
    gesture=undefined;
    if (id!==undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  const events=new AbortController();
  const options={capture:true,signal:events.signal};
  function consume(e) { e.preventDefault();e.stopImmediatePropagation(); }
  canvas.addEventListener('pointerdown',e=>{
    if (!visible || !e.isPrimary || e.button!==0) return;
    const pos=ground(e);
    if (!pos) return;
    const points=knots().map(p=>p.slice());
    let index=-1, insert=false, distance=e.pointerType==='touch'?18:11;
    const rect=canvas.getBoundingClientRect(), x=e.clientX-rect.left,y=e.clientY-rect.top;
    if (!drawing) {
      points.forEach((p,i)=>{
        const v=project(...p),d=Math.hypot(x-v.x,y-v.y);
        if (d<distance) {distance=d;index=i;}
      });
      if (index<0 && points.length<maxRoutePoints) {
        distance=e.pointerType==='touch'?20:13;
        for (const s of measureRoute(points).segments) {
          const v=project(s.x,s.z),d=Math.hypot(x-v.x,y-v.y);
          if (d<distance) {distance=d;index=s.knot+1;}
        }
        if (index>=0) {points.splice(index,0,pos);insert=true;}
      }
    }
    // Empty ground remains available for orbiting until Redraw is selected.
    if (!drawing && index<0) return;
    const stroke=drawing;
    gesture={id:e.pointerId,index,points:stroke?[pos]:points,stroke,insert,start:pos,moved:false};
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(e.pointerId);consume(e);
  },options);
  function move(e) {
    if (!gesture || gesture.id!==e.pointerId) return;
    consume(e);
    const pos=ground(e);
    if (!pos) return;
    const g=gesture;
    g.moved ||= Math.hypot(pos[0]-g.start[0],pos[1]-g.start[1])>.018;
    if (!g.moved) return;
    if (g.stroke) {
      const last=g.points.at(-1);
      const spacing=e.type==='pointerup' ? .025 : .09;
      if (Math.hypot(pos[0]-last[0],pos[1]-last[1])>spacing) {
        if (g.points.length>=maxRoutePoints) g.points=g.points.filter((_,i)=>i%2===0 || i===g.points.length-1);
        g.points.push(pos);
      }
    } else g.points[g.index]=pos;
  }
  canvas.addEventListener('pointermove',move,options);
  canvas.addEventListener('pointerup',e=>{
    if (gesture?.id!==e.pointerId) return;
    move(e);
    const {points,moved,insert,stroke}=gesture;
    cancel();
    if ((moved || insert) && readRoute(points)) {applyRoute(points);setDrawing(false);}
    else if (stroke && !moved) finish();
  },options);
  for (const type of ['pointercancel','lostpointercapture']) canvas.addEventListener(type,e=>{
    if (e.pointerId===gesture?.id) cancel();
  },options);
  window.addEventListener('blur',cancel,{signal:events.signal});
  document.addEventListener('keydown',e=>{
    if (visible && (e.key==='Escape' || (e.ctrlKey || e.metaKey) && ['y','z'].includes(e.key.toLowerCase()))) {
      cancel();setDrawing(false);
    }
  },options);
  document.getElementById('finish-path').addEventListener('click',finish,{signal:events.signal});
  redraw.addEventListener('click',()=>{cancel();setDrawing(!drawing);canvas.focus({preventScroll:true});});
  scene.onDisposeObservable.addOnce(()=>{events.abort();scene.onAfterRenderObservable.remove(observer);});
  return {show(value) {
    cancel();visible=value;guide.hidden=actions.hidden=!value;setDrawing(false);
  }};
}
