import { Quaternion, Vector3 } from '@babylonjs/core';

function installSheets() {
  const controls = document.getElementById('controls');
  const triggers = [...controls.querySelectorAll('.trigger')];
  let open;
  function show(next) {
    for (const trigger of triggers) {
      const expanded = trigger === next;
      trigger.setAttribute('aria-expanded', String(expanded));
      document.getElementById(trigger.getAttribute('aria-controls')).hidden = !expanded;
    }
    open = next;
  }
  for (const trigger of triggers) {
    trigger.addEventListener('click', () => show(open === trigger ? null : trigger));
  }
  document.addEventListener('pointerdown', event => {
    if (open && !controls.contains(event.target)) show(null);
  });
  document.addEventListener('focusin', event => {
    if (open && !controls.contains(event.target)) show(null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      open.focus();
      show(null);
    }
  });
  controls.hidden = false;
}

function installDaylight(sun, shadowPlane) {
  const bearing = document.getElementById('bearing');
  const altitude = document.getElementById('altitude');
  const radians = Math.PI / 180;
  const initialDirection = sun.direction.clone();
  const initialPosition = sun.position.clone();
  const source = initialDirection.negate().normalize();
  const initialBearing = Math.round((Math.atan2(source.x, source.z) / radians + 360) % 360);
  const initialAltitude = Math.round(Math.asin(source.y) / radians);
  const pivot = initialPosition.add(initialDirection.normalizeToNew().scale(6));
  function update() {
    const az = bearing.valueAsNumber * radians, el = altitude.valueAsNumber * radians;
    const home = bearing.valueAsNumber === initialBearing && altitude.valueAsNumber === initialAltitude;
    const lightVector = new Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el));
    if (home) {
      sun.direction.copyFrom(initialDirection);
      sun.position.copyFrom(initialPosition);
    } else {
      sun.direction.copyFrom(lightVector).scaleInPlace(-initialDirection.length());
      sun.position.copyFrom(pivot).addInPlace(lightVector.scale(6));
    }
    // The offline silhouette was baked for morning light. Hand it over to
    // the real-time shadow map as the sun moves away from that direction.
    const deviation = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(lightVector, source)))) / radians;
    shadowPlane.material.alpha = home ? 1 : Math.max(0, 1-deviation/24);
    for (const input of [bearing, altitude]) {
      const value = input.value + '°';
      document.querySelector('output[for="' + input.id + '"]').value = value;
      input.setAttribute('aria-valuetext', input.value + ' 度');
    }
  }
  function reset() {
    bearing.value = initialBearing;
    altitude.value = initialAltitude;
    update();
  }
  bearing.addEventListener('input', update);
  altitude.addEventListener('input', update);
  document.getElementById('reset-sun').addEventListener('click', reset);
  reset();
}

export function installGardenControls({base, loadPlantedModel, shadows, glass, contacts, sun, shadowPlane}) {
  const fox = base.find(mesh => mesh.name.startsWith('Fox ·'));
  const cache = new Map([['fox', Promise.resolve([fox])]]);
  const notice = document.getElementById('animal-notice');
  const buttons = [...document.querySelectorAll('[data-animal]')];
  // Soil height and normal at the footprint shared with the authored fox.
  const tilt = Quaternion.FromUnitVectorsToRef(Vector3.Up(), new Vector3(.130, 1, .221).normalize(), new Quaternion());
  let active = [fox];
  let request = 0;
  async function prepare(id) {
    const meshes = await loadPlantedModel('animal-' + id);
    for (const mesh of meshes) {
      mesh.setEnabled(false);
      mesh.position.set(.39, .627, .58);
      mesh.rotationQuaternion = tilt.multiply(Quaternion.RotationAxis(Vector3.Up(), -.30));
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh);
    }
    glass.addContents?.(meshes);
    return meshes;
  }
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const id = button.dataset.animal;
      const ticket = ++request;
      if (!cache.has(id)) {
        cache.set(id, prepare(id).catch(error => { cache.delete(id); throw error; }));
      }
      const name = button.textContent.trim();
      notice.textContent = '正在摆放' + name + '…';
      try {
        const next = await cache.get(id);
        if (ticket !== request) return;
        for (const mesh of active) mesh.setEnabled(false);
        for (const mesh of next) mesh.setEnabled(true);
        active = next;
        contacts.setAnimal(id);
        for (const choice of buttons) choice.setAttribute('aria-pressed', String(choice === button));
        document.getElementById('garden').setAttribute('aria-label', '可旋转的玻璃微景观，陶土' + name + '在蕨间小径旁');
        notice.textContent = '';
      } catch (error) {
        if (ticket !== request) return;
        console.error(error);
        notice.textContent = name + '加载失败，点选可重试。';
      }
    });
  }
  installDaylight(sun, shadowPlane);
  installSheets();
}
