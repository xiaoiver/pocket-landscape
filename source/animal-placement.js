import {Color3, PointerEventTypes, PositionGizmo, Ray, TransformNode, Vector3} from '@babylonjs/core';

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
  const focus = new Vector3(), localFocus = new Vector3(), offset = new Vector3();
  let active = [], limit = 1, gizmo;

  function settle() {
    const p = anchor.position;
    const radius = Math.hypot(p.x,p.z);
    if (radius > limit) { p.x *= limit/radius; p.z *= limit/radius; }
    p.y = home.y + ((floorAt(p.x,p.z) ?? homeFloor)-homeFloor);
    anchor.computeWorldMatrix(true);
    p.subtractToRef(home,offset);
    contacts.setOffset(offset);
    p.addToRef(localFocus,focus);
  }

  function pick(mesh) {
    if (!active.includes(mesh)) {
      if (gizmo) gizmo.attachedNode = null;
      return;
    }
    if (!gizmo) {
      gizmo = new PositionGizmo();
      gizmo.yGizmo.isEnabled = false;
      gizmo.yPlaneGizmo.isEnabled = true;
      gizmo.scaleRatio = .52;
      for (const [handle, tint] of [[gizmo.xGizmo,'#b96a4d'],[gizmo.zGizmo,'#43919a'],[gizmo.yPlaneGizmo,'#ded8ae']]) {
        for (const [material, color] of [[handle.coloredMaterial,tint],[handle.hoverMaterial,'#fff0bd']]) {
          material.disableLighting = true;
          material.emissiveColor = Color3.FromHexString(color);
        }
      }
      gizmo.yPlaneGizmo.coloredMaterial.alpha = .78;
      gizmo.updateGizmoRotationToMatchAttachedMesh = false;
      gizmo.onDragObservable.add(settle);
    }
    gizmo.attachedNode = anchor;
  }
  scene.onPointerObservable.add(info => pick(info.pickInfo?.pickedMesh),PointerEventTypes.POINTERTAP | PointerEventTypes.POINTERDOUBLETAP);
  const escape = event => { if (event.key === 'Escape') pick(null); };
  window.addEventListener('keydown',escape);
  scene.onDisposeObservable.addOnce(() => {
    window.removeEventListener('keydown',escape);
    gizmo?.dispose();
  });

  return {focus, activate(meshes) {
    active = meshes;
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
    limit = Math.max(0,1.32-extent);
    settle();
  }};
}
