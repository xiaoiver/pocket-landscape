import {describeGarden, wording} from './interface-language.js';
import { Quaternion, Vector3 } from '@babylonjs/core';

function installSheets(setView) {
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
  for (const button of controls.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => {
      setView(button.dataset.view);
      show(null);
      document.getElementById('garden').focus({preventScroll: true});
    });
  }
  controls.hidden = false;
}

export function installGardenControls({base, loadPlantedModel, shadows, glass, contacts, placement, setRain, setView, life, mist}) {
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
      notice.textContent = wording('正在摆放' + name + '…', 'Placing ' + name.toLowerCase() + '…');
      try {
        const next = await cache.get(id);
        if (ticket !== request) return;
        for (const mesh of active) mesh.setEnabled(false);
        for (const mesh of next) mesh.setEnabled(true);
        active = next;
        contacts.setAnimal(id);
        placement.activate(next);
        for (const choice of buttons) choice.setAttribute('aria-pressed', String(choice === button));
        describeGarden(name);
        delete button.dataset.status;
        notice.textContent = '';
      } catch (error) {
        if (ticket !== request) return;
        button.dataset.status = 'error';
        console.error(error);
        notice.textContent = wording(name + '加载失败，点选可重试。', 'Could not load the ' + name.toLowerCase() + '. Tap to retry.');
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
  const mistSetting = document.getElementById('mist-setting');
  mistSetting.checked = mist.mesh.isEnabled();
  mistSetting.addEventListener('change', () => mist.mesh.setEnabled(mistSetting.checked));
  const plants = document.getElementById('plants-setting'), motes = document.getElementById('motes-setting');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  function reflectMotion() {
    const available = Boolean(life.motes) && !preference.matches;
    plants.disabled = motes.disabled = !available;
    plants.checked = available && life.plantsOn;
    motes.checked = available && life.motesOn;
    const note = document.getElementById('motion-note');
    note.hidden = available;
    note.textContent = !life.motes ? wording('当前链接已关闭场景动态。','Animations are disabled for this link.') : wording('已按系统的减少动态效果设置暂停。','Animations are paused for your reduced motion preference.');
  }
  plants.addEventListener('change', () => life.setPlants(plants.checked));
  motes.addEventListener('change', () => life.setMotes(motes.checked));
  preference.addEventListener('change', reflectMotion);
  mist.mesh.getScene().onDisposeObservable.addOnce(() => preference.removeEventListener('change', reflectMotion));
  reflectMotion();
  installSheets(setView);
}
