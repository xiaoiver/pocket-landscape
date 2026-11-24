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
  controls.querySelector('.weather').addEventListener('click', () => show(null));
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

export function installGardenControls({base, loadPlantedModel, shadows, glass, contacts, setRain}) {
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
      const name = button.getAttribute('aria-label');
      for (const choice of buttons) delete choice.dataset.status;
      button.dataset.status = 'loading';
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
        delete button.dataset.status;
        notice.textContent = '';
      } catch (error) {
        if (ticket !== request) return;
        button.dataset.status = 'error';
        console.error(error);
        notice.textContent = name + '加载失败，点选可重试。';
      }
    });
  }
  const weatherChoices = [...document.querySelectorAll('[data-weather]')];
  for (const choice of weatherChoices) {
    choice.addEventListener('click', () => {
      if (choice.getAttribute('aria-pressed') === 'true') return;
      setRain(choice.dataset.weather === 'rain');
      for (const item of weatherChoices) item.setAttribute('aria-pressed', String(item === choice));
    });
  }
  installSheets();
}
