import {Scene} from '@babylonjs/core';

export const tapHandful = 8;
const fullHandful = 24;
function handfulSize(elapsed) {
  // Leave a short tap window before adding one more pebble every 75 ms.
  return Math.min(fullHandful,tapHandful+Math.floor(Math.max(0,elapsed-250)/75));
}

export function installPebblePour(scene,canvas,{enabled,pick,release}) {
  const preview = document.getElementById('pour-preview');
  const count = preview.querySelector('b');
  const bed = preview.querySelector('span');
  for (let i=0;i<fullHandful;i++) {
    const dot = document.createElement('i');
    const radius = Math.sqrt((i+.5)/fullHandful);
    const angle = i*2.39996;
    dot.style.left = (50+43*radius*Math.cos(angle))+'%';
    dot.style.top = (50+38*radius*Math.sin(angle))+'%';
    bed.append(dot);
  }
  let press;
  const events = new AbortController();
  const options = {capture:true,signal:events.signal};
  function cancel() {
    press = undefined;
    preview.hidden = true;
  }
  function draw(now) {
    if (!press) return;
    const n = handfulSize(now-press.start);
    if (n!==press.shown) {
      count.textContent = String(n);
      for (let i=0;i<bed.children.length;i++) bed.children[i].hidden = i>=n;
      press.shown = n;
    }
  }
  function moved(event) {
    return Math.hypot(event.clientX-press.x,event.clientY-press.y)>Scene.DragMovementThreshold;
  }
  window.addEventListener('pointerdown',event => {
    if (press) {cancel(); return;}
    if (!enabled() || event.target!==canvas || !event.isPrimary || event.button!==0) return;
    const rect = canvas.getBoundingClientRect();
    const point = pick(event.clientX-rect.left,event.clientY-rect.top);
    if (!point) return;
    press = {id:event.pointerId,x:event.clientX,y:event.clientY,start:event.timeStamp,point};
    preview.style.left = event.clientX+'px';
    preview.style.top = event.clientY+'px';
    draw(event.timeStamp);
    preview.hidden = false;
  },options);
  window.addEventListener('pointermove',event => {
    if (press?.id===event.pointerId && moved(event)) cancel();
  },options);
  window.addEventListener('pointerup',event => {
    if (press?.id!==event.pointerId) return;
    const {point,start} = press;
    const valid = enabled() && !moved(event) && document.elementFromPoint(event.clientX,event.clientY)===canvas;
    cancel();
    if (valid) release(point,handfulSize(event.timeStamp-start));
  },options);
  for (const name of ['pointercancel','lostpointercapture']) {
    window.addEventListener(name,event => {if (press?.id===event.pointerId) cancel();},options);
  }
  window.addEventListener('blur',cancel,options);
  canvas.addEventListener('wheel',cancel,options);
  document.addEventListener('visibilitychange',cancel,options);
  document.addEventListener('keydown',event => {if (event.key==='Escape') cancel();},options);
  scene.onBeforeRenderObservable.add(() => {if (press) draw(performance.now());});
  scene.onDisposeObservable.addOnce(() => {cancel();events.abort();bed.replaceChildren();});
  return cancel;
}
