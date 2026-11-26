import {Scene} from '@babylonjs/core';

// Hotspots are in the toolbar icons' 24 × 24 viewBox.
const hotspots = {
  soil:[4,21], pebbles:[8,19], rock:[10,19], moss:[4,20], fern:[4,21],
  fernC:[12,21], fittonia:[12,21], ivory:[12,21], rose:[12,21], canopy:[12,21], animal:[12,19], erase:[9,21],
};

function iconCursor(icon, [x,y]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <defs><g id="icon">${icon.innerHTML}</g></defs>
    <use href="#icon" stroke="#fffdf5" stroke-width="3.6"/>
    <use href="#icon" stroke="#304632" stroke-width="1.7"/>
  </svg>`;
  const url = 'data:image/svg+xml,'+encodeURIComponent(svg);
  return `url("${url}") ${Math.round(x*32/24)} ${Math.round(y*32/24)}, crosshair`;
}

export function installEditorCursor(scene,canvas,buttons,paw) {
  const cursors = new Map();
  for (const button of [...buttons,paw]) {
    const tool = button.dataset.editorTool || 'animal';
    if (hotspots[tool]) cursors.set(tool,iconCursor(button.querySelector('svg'),hotspots[tool]));
  }
  scene.doNotHandleCursors = true;
  canvas.style.removeProperty('cursor');
  let start;
  const events = new AbortController();
  const options = {signal:events.signal};
  function release() {
    start = undefined;
    canvas.classList.remove('orbiting');
  }
  canvas.addEventListener('pointerdown',event => {
    if (event.isPrimary && event.pointerType==='mouse') start={id:event.pointerId,x:event.clientX,y:event.clientY};
  },options);
  canvas.addEventListener('pointermove',event => {
    if (event.pointerId!==start?.id) return;
    if (!event.buttons) {release();return;}
    if (Math.max(Math.abs(event.clientX-start.x),Math.abs(event.clientY-start.y))>Scene.DragMovementThreshold) {
      canvas.classList.add('orbiting');
    }
  },options);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    window.addEventListener(type,event => {if (event.pointerId===start?.id) release();},options);
  }
  window.addEventListener('blur',release,options);
  scene.onDisposeObservable.addOnce(() => {
    events.abort();
    release();
    canvas.style.removeProperty('--tool-cursor');
  });
  return (tool,hasSelection) => {
    const cursor = tool==='move' ? (hasSelection ? 'crosshair' : 'grab') : cursors.get(tool);
    canvas.style.setProperty('--tool-cursor',cursor || 'crosshair');
  };
}
