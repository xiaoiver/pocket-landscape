import {labelButton, wording} from './interface-language.js';

const prefixes = {
  'fern-path':'pocket-landscape.fern-path.v1.',
  'pebble-slope':'pocket-landscape.pebble-slope.v1.',
};
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
export function newPresetId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');
}
export function presetKey(id, kind='fern-path') {
  return validId(id) && Object.hasOwn(prefixes,kind) ? prefixes[kind]+id : null;
}

export function installPresetLibrary(currentSnapshot, kind, onDelete) {
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
    url.searchParams.set('mode','build');
    url.searchParams.delete('preset');
    url.searchParams.delete('copy');
    location.assign(url.href);
  });
  const original = document.getElementById('new-fern-path');
  original.addEventListener('click',() => open(newPresetId(),'fern-path'));
  document.getElementById('new-pebble-slope').addEventListener('click',() => open(newPresetId(),'pebble-slope'));
  const label = kind==='pebble-slope' ? wording('卵石坡','Pebble Slope') : wording('蕨间小径','Fern Path');
  function open(id,sceneKind) {
    const url = new URL(location.href);
    url.searchParams.set('mode','build');
    url.searchParams.set('preset',sceneKind);
    url.searchParams.set('copy',id);
    location.assign(url.href);
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded','false');
  }
  function renderCopies() {
    list.replaceChildren();
    const copies = [];
    try {
      for (let i=0; i<localStorage.length; i++) {
        const key = localStorage.key(i);
        const sceneKind = Object.keys(prefixes).find(type => key?.startsWith(prefixes[type]));
        if (!sceneKind) continue;
        const id = key.slice(prefixes[sceneKind].length);
        if (!validId(id)) continue;
        try {
          const copy = JSON.parse(localStorage.getItem(key));
          if (typeof copy?.name === 'string') copies.push({id,name:copy.name,sceneKind});
        } catch { /* Other copies can still be opened. */ }
      }
    } catch { /* Report storage failure if a save is attempted. */ }
    const template = document.getElementById('preset-copy-row');
    for (const [index,copy] of copies.entries()) {
      const row = template.content.firstElementChild.cloneNode(true);
      const button = row.querySelector('.copy-name');
      button.textContent = copy.name;
      button.addEventListener('click',() => open(copy.id,copy.sceneKind));
      const remove = row.querySelector('.delete-copy');
      labelButton(remove,wording('删除“'+copy.name+'”','Delete “'+copy.name+'”'));
      remove.addEventListener('click',() => {
        if (!window.confirm(wording('删除已保存的“'+copy.name+'”？','Delete the saved copy “'+copy.name+'”?'))) return;
        const key = presetKey(copy.id,copy.sceneKind);
        try { localStorage.removeItem(key); }
        catch {
          feedback.textContent = wording('浏览器无法删除此副本。','The browser could not delete this copy.');
          return;
        }
        onDelete(key);
        renderCopies();
        const remaining = list.querySelectorAll('.copy-name');
        (remaining[index] ?? remaining[index-1] ?? (name.closest('form').hidden ? original : name)).focus();
      });
      list.append(row);
    }
    name.placeholder = label+' '+(copies.length+1);
  }
  window.addEventListener('storage',event => {
    if (event.storageArea !== localStorage || event.newValue !== null ||
        !Object.values(prefixes).some(prefix => event.key?.startsWith(prefix))) return;
    onDelete(event.key);
    if (!panel.hidden) renderCopies();
  });
  function show() {
    const animal = document.getElementById('animal-trigger');
    if (animal.getAttribute('aria-expanded')==='true') animal.click();
    name.value = '';
    renderCopies();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    document.getElementById('return-to-preview').focus();
  }
  trigger.addEventListener('click',() => panel.hidden ? show() : close());
  panel.addEventListener('submit',event => {
    event.preventDefault();
    const id = newPresetId();
    const copy = {...currentSnapshot?.(),name:name.value.trim() || name.placeholder};
    try {
      localStorage.setItem(presetKey(id,kind),JSON.stringify(copy));
    } catch {
      feedback.textContent = wording('浏览器无法保存副本。','The browser could not save this copy.');
      return;
    }
    open(id,kind);
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
  return close;
}
