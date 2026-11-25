import {wording} from './interface-language.js';

const prefix = 'pocket-landscape.fern-path.v1.';
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export function newPresetId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
}
export function presetKey(id) {
  return validId(id) ? prefix+id : null;
}

export function installPresetLibrary(currentSnapshot) {
  const trigger = document.getElementById('preset-trigger');
  const panel = document.getElementById('preset-sheet');
  const list = document.getElementById('preset-copies');
  const name = document.getElementById('preset-name');
  const feedback = document.getElementById('editor-feedback');
  const blank = document.getElementById('open-blank');
  blank.hidden = !currentSnapshot;
  panel.querySelector('form').hidden = !currentSnapshot;
  blank.addEventListener('click',() => {
    const url = new URL(location.href);
    url.searchParams.delete('preset');
    url.searchParams.delete('copy');
    location.assign(url.href);
  });
  const original = document.getElementById('new-fern-path');
  original.addEventListener('click',() => open(newPresetId()));
  const label = wording('蕨间小径','Fern Path');
  function open(id) {
    const url = new URL(location.href);
    url.searchParams.set('mode','build');
    url.searchParams.set('preset','fern-path');
    url.searchParams.set('copy',id);
    location.assign(url.href);
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded','false');
  }
  function show() {
    const animal = document.getElementById('animal-trigger');
    if (animal.getAttribute('aria-expanded')==='true') animal.click();
    list.replaceChildren();
    const copies = [];
    try {
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const id = key.slice(prefix.length);
        if (!validId(id)) continue;
        try {
          const copy = JSON.parse(localStorage.getItem(key));
          if (typeof copy?.name === 'string') copies.push({id,name:copy.name});
        } catch { /* Other copies can still be opened. */ }
      }
    } catch { /* Report storage failure if a save is attempted. */ }
    for (const copy of copies) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = copy.name;
      button.addEventListener('click',() => open(copy.id));
      list.append(button);
    }
    name.value = '';
    name.placeholder = label+' '+(copies.length+1);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    (currentSnapshot ? name : original).focus();
  }
  trigger.addEventListener('click',() => panel.hidden ? show() : close());
  panel.addEventListener('submit',event => {
    event.preventDefault();
    const id = newPresetId();
    const copy = {...currentSnapshot?.(),name:name.value.trim() || name.placeholder};
    try {
      localStorage.setItem(presetKey(id),JSON.stringify(copy));
    } catch {
      feedback.textContent = wording('浏览器无法保存副本。','The browser could not save this copy.');
      return;
    }
    open(id);
  });
  document.addEventListener('pointerdown',event => {
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('focusin',event => {
    if (!panel.contains(event.target) && event.target!==trigger) close();
  });
  document.addEventListener('keydown',event => {
    if (!panel.hidden && event.key === 'Escape') {close();trigger.focus();}
  });
  trigger.hidden = false;
}
