import {installEditHistory} from './edit-history.js';
import {wording} from './interface-language.js';
import {Matrix, PointerEventTypes, Ray, TransformNode, Vector3} from '@babylonjs/core';

export function createAnimalPlacement(scene, surfaces, contacts) {
  // Both the baked fox and the imported figurines are authored at this footprint.
  const home = new Vector3(.39,.627,.58);
  const anchor = new TransformNode('Figurine footprint',scene);
  anchor.position.copyFrom(home);
  const contents = new TransformNode('Figurine offset',scene);
  contents.parent = anchor;
  contents.position.copyFrom(home).scaleInPlace(-1);
  const floorRay = new Ray(Vector3.Zero(),Vector3.Down());
  const canLand = mesh => surfaces.has(mesh) && mesh.isEnabled();
  function floorAt(x,z) {
    floorRay.origin.set(x,3,z);
    return scene.pickWithRay(floorRay,canLand)?.pickedPoint?.y;
  }
  const homeFloor = floorAt(home.x,home.z) ?? home.y;
  const focus = new Vector3(), localFocus = new Vector3();
  const stepsPerTurn = 24;
  let turn = 0;
  let active = [], limit = 1, footprint = .3;
  let selected = false, gesture, original;
  const canvas = scene.getEngine().getRenderingCanvas();
  const ring = document.getElementById('placement-ring');
  const bar = document.getElementById('placement-bar');
  const message = document.getElementById('placement-message');
  const action = document.getElementById('placement-action');

  const done = document.getElementById('placement-done');
  const left = document.getElementById('placement-left');
  const right = document.getElementById('placement-right');

  function snapshot() {
    return JSON.stringify({x:anchor.position.x,z:anchor.position.z,turn});
  }
  let before;
  const history = installEditHistory(() => selected ? before : snapshot(),serialized => {
    cancel();
    const pose=JSON.parse(serialized);
    anchor.position.x=pose.x;
    anchor.position.z=pose.z;
    turn=pose.turn;
    settle();
  });
  function restore(pose) {
    anchor.position.copyFrom(pose.position);
    turn = pose.turn;
    settle();
  }

  function settle() {
    const p = anchor.position;
    const radius = Math.hypot(p.x,p.z);
    if (radius > limit) { p.x *= limit/radius; p.z *= limit/radius; }
    p.y = home.y + ((floorAt(p.x,p.z) ?? homeFloor)-homeFloor);
    anchor.rotation.y = turn * 2 * Math.PI / stepsPerTurn;
    Vector3.TransformCoordinatesToRef(localFocus,anchor.computeWorldMatrix(true),focus);
    contacts.setTransform(contents.computeWorldMatrix(true));
    for (const mesh of active) mesh.computeWorldMatrix(true);
  }

  function refresh() {
    ring.hidden = !selected;
    bar.hidden = !selected;
    canvas.style.cursor = selected ? 'crosshair' : '';
    message.textContent = selected ? wording('点地摆放', 'Tap the ground to place') : wording('已摆放', 'Figurine placed');
  }

  function select() {
    if (!selected) { original = {position:anchor.position.clone(), turn}; before = snapshot(); }
    selected = true;
    refresh();
  }

  function finish() {
    selected = false;
    history.record(before);
    original = null;
    refresh();
  }

  function cancel() {
    if (gesture) {
      const id = gesture.id;
      gesture = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    if (selected && original) {
      restore(original);
    }
    selected = false;
    original = null;
    refresh();
  }

  function rotate(direction) {
    if (!selected || gesture) return;
    turn = (turn + direction + stepsPerTurn) % stepsPerTurn;
    settle();
  }
  const turnLeft = () => rotate(1);
  const turnRight = () => rotate(-1);
  function confirm() {
    finish();
    canvas.focus({preventScroll:true});
  }

  function cancelPlacement() {
    cancel();
    canvas.focus({preventScroll:true});
  }

  // Project the footprint in CSS pixels so it stays readable through glass
  // and follows both the camera tilt and the animal's size.
  const marker = scene.onAfterRenderObservable.add(() => {
    if (!selected) return;
    const camera = scene.activeCamera, engine = scene.getEngine();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const center = anchor.position.clone();
    center.y += .024;
    const edge = center.add(new Vector3(-Math.sin(camera.alpha), 0, Math.cos(camera.alpha)).scale(footprint));
    const project = p => Vector3.Project(p, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport);
    const middle = project(center), side = project(edge);
    const scale = canvas.clientWidth / engine.getRenderWidth();
    const width = 2 * Math.abs(side.x - middle.x) * scale;
    ring.style.left = (canvas.offsetLeft + middle.x * scale) + 'px';
    ring.style.top = (canvas.offsetTop + middle.y * canvas.clientHeight / engine.getRenderHeight()) + 'px';
    ring.style.width = width + 'px';
    ring.style.height = Math.max(6, width * Math.abs(Math.cos(camera.beta))) + 'px';
  });

  function coords(event) {
    const rect = canvas.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
  }
  function claim(event) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
  function down(event) {
    if (gesture && event.pointerId !== gesture.id) cancel();
    if (!event.isPrimary || event.button !== 0) return;
    const {x,y} = coords(event);
    const hit = scene.pick(x,y);
    if (!active.includes(hit?.pickedMesh)) return;
    claim(event);
    canvas.focus({preventScroll:true});
    select();
    const camera = scene.activeCamera;
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    gesture = {id:event.pointerId, x, y, hit:hit.pickedPoint, start:anchor.position.clone(), dragging:false};
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (event.pointerId !== gesture?.id) return;
    claim(event);
    const {x,y} = coords(event);
    if (!gesture.dragging && Math.hypot(x-gesture.x,y-gesture.y) < 6) return;
    gesture.dragging = true;
    canvas.style.cursor = 'grabbing';
    // Drag on the plane through the grabbed point. Grabbing the fox by its
    // head therefore leaves its feet in place until the pointer moves.
    const ray = scene.createPickingRay(x,y,Matrix.IdentityReadOnly,scene.activeCamera);
    if (Math.abs(ray.direction.y) < .0001) return;
    const distance = (gesture.hit.y-ray.origin.y)/ray.direction.y;
    if (distance <= 0) return;
    anchor.position.x = gesture.start.x + ray.origin.x + distance*ray.direction.x - gesture.hit.x;
    anchor.position.z = gesture.start.z + ray.origin.z + distance*ray.direction.z - gesture.hit.z;
    settle();
  }
  function up(event) {
    if (event.pointerId !== gesture?.id) return;
    claim(event);
    const dragged = gesture.dragging;
    gesture = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (dragged) finish();
  }
  function interrupted(event) {
    if (event.pointerId === gesture?.id) cancel();
  }
  const taps = scene.onPointerObservable.add(() => {
    if (!selected || gesture) return;
    const hit = scene.pick(scene.pointerX,scene.pointerY,mesh =>
      mesh.isEnabled() && mesh.isVisible && (surfaces.has(mesh) || mesh.isPickable));
    if (!surfaces.has(hit?.pickedMesh) || (hit.getNormal(true)?.y ?? 0) < .15) {
      cancel();
      return;
    }
    anchor.position.x = hit.pickedPoint.x;
    anchor.position.z = hit.pickedPoint.z;
    settle();
    finish();
  }, PointerEventTypes.POINTERTAP | PointerEventTypes.POINTERDOUBLETAP);

  function key(event) {
    if (event.key === 'Escape' && selected) { cancel(); return; }
    if (event.target !== canvas || gesture) return;
    if (event.key === 'Enter' || event.key === ' ') {
      claim(event);
      if (!event.repeat) { if (selected) finish(); else select(); }
      return;
    }
    if (selected && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLowerCase();
      if (letter === 'q' || letter === 'e') {
        claim(event);
        rotate(letter === 'q' ? 1 : -1);
        return;
      }
    }
    if (!selected || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
    claim(event);
    const camera = scene.activeCamera;
    const angle = camera.alpha + {ArrowUp:Math.PI, ArrowDown:0, ArrowLeft:Math.PI/2, ArrowRight:-Math.PI/2}[event.key];
    const step = event.shiftKey ? .075 : .025;
    anchor.position.x += Math.cos(angle)*step;
    anchor.position.z += Math.sin(angle)*step;
    settle();
  }

  const listeners = {pointerdown:down, pointermove:move, pointerup:up, pointercancel:interrupted, lostpointercapture:interrupted};
  for (const [name, handler] of Object.entries(listeners)) canvas.addEventListener(name,handler,true);
  window.addEventListener('keydown',key,true);
  window.addEventListener('blur',cancel);
  left.addEventListener('click',turnLeft);
  right.addEventListener('click',turnRight);
  done.addEventListener('click',confirm);
  action.addEventListener('click',cancelPlacement);
  scene.onDisposeObservable.addOnce(() => {
    for (const [name, handler] of Object.entries(listeners)) canvas.removeEventListener(name,handler,true);
    window.removeEventListener('keydown',key,true);
    window.removeEventListener('blur',cancel);
    left.removeEventListener('click',turnLeft);
    right.removeEventListener('click',turnRight);
    done.removeEventListener('click',confirm);
    action.removeEventListener('click',cancelPlacement);
    scene.onAfterRenderObservable.remove(marker);
    scene.onPointerObservable.remove(taps);
  });

  return {focus, activate(meshes) {
    cancel();
    active = meshes;
    // Measure in the unturned pose so refocusing or changing species at
    // any yaw preserves the rotation-independent clearance from the glass.
    anchor.rotation.y = 0;
    anchor.computeWorldMatrix(true);
    contents.computeWorldMatrix(true);
    const min = new Vector3(Infinity,Infinity,Infinity);
    const max = min.scale(-1);
    let extent = 0;
    for (const mesh of meshes) {
      mesh.isPickable = true;
      if (mesh.parent !== contents) {
        mesh.setParent(null,true);
        mesh.parent = contents;
      }
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld);
      max.maximizeInPlace(box.maximumWorld);
      for (const v of box.vectorsWorld) {
        extent = Math.max(extent,Math.hypot(v.x-anchor.position.x,v.z-anchor.position.z));
      }
    }
    min.addToRef(max,localFocus);
    localFocus.scaleInPlace(.5).subtractInPlace(anchor.position);
    // All three silhouettes fit inside the narrowest planted part of the glass.
    footprint = Math.max(.13,extent*.82);
    limit = Math.max(0,1.32-extent);
    settle();
  }};
}
