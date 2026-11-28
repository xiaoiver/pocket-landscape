// The original planting and its working copy share the camera, lighting, glass
// and immutable terrain. Only meshes the tools can modify need a second pose.
import {TransformNode} from '@babylonjs/core';
import {openPebbleEditor} from './pebble-editor.js';
import {newPresetId, presetKey} from './preset-library.js';
import {wording} from './interface-language.js';

export function installPresetEditorMode({scene, glass, shadows, loadPlantedModel, desk, preset, onModeChange}) {
  const button = document.getElementById('editor-trigger');
  const feedback = document.getElementById('editor-feedback');
  const params = new URLSearchParams(location.search);
  const initialEdit = params.get('mode') === 'build';
  const copyId = initialEdit ? (presetKey(params.get('copy')) ? params.get('copy') : newPresetId()) : 'draft';
  let desired = false, editing = false, preparing, session;
  function modeUrl(edit) {
    const url = new URL(location.href);
    for (const key of ['mode','preset','copy']) url.searchParams.delete(key);
    if (edit) {
      url.searchParams.set('mode','build');
      url.searchParams.set('preset','fern-path');
      url.searchParams.set('copy',copyId);
    }
    return url.href;
  }
  function writeUrl(edit, replace=false) {
    const href = modeUrl(edit);
    if (location.href !== href) {
      // Some browsers restrict query changes on offline file:// documents.
      try { history[replace ? 'replaceState' : 'pushState'](null,'',href); }
      catch (error) { if (error.name !== 'SecurityError') throw error; }
    }
  }

  async function prepare() {
    const root = new TransformNode('Editable planting',scene);
    root.setEnabled(false);
    const originals = [];
    let vessel = 'open';
    const editGlass = {
      addContents(meshes) {
        for (const mesh of meshes) mesh.setParent(root,true);
        glass.addContents?.(meshes);
      },
      removeContents:meshes => glass.removeContents?.(meshes),
      setVessel(type) { vessel=type; if (editing) glass.setVessel(type); },
    };
    function clone(mesh,unique=false) {
      const instance = mesh.clone(mesh.name,mesh.parent,true);
      // The path and fox bake edits into their vertices. On devices using vertex
      // attributes for plant sway, detaching morph targets also edits geometry.
      if (unique || mesh === preset.pathMesh || mesh.name.startsWith('Fox ·') ||
          mesh.morphTargetManager?.isUsingTextureForTargets === false) instance.makeGeometryUnique();
      instance.morphTargetManager = null;
      editGlass.addContents([instance]);
      shadows.addShadowCaster(instance,false);
      originals.push(mesh);
      return instance;
    }
    try {
      const base = preset.base.filter(mesh => mesh === preset.pathMesh ||
        /^(Fox ·|Woodland outcrop|Weathered granite|Canopy |Fittonia ·)/.test(mesh.name) || mesh.name==='Petioles').map(mesh => clone(mesh));
      const editable = {...preset,base,specimens:preset.specimens.map(mesh => clone(mesh)),
        pathMesh:base.find(mesh => mesh.name === preset.pathMesh.name)};
      if (preset.moss) {
        const {bank,rosettes,shoots} = preset.moss;
        editable.moss = {bank:clone(bank,true),rosettes:rosettes && clone(rosettes,true),
          shoots:shoots.map(batch=>({...batch,mesh:clone(batch.mesh,true)}))};
        editable.grounds = [preset.grounds[0],editable.moss.bank];
      }
      const editor = await openPebbleEditor(scene,editGlass,shadows,loadPlantedModel,desk,{preset:editable,storageKey:presetKey(copyId)});
      return value => {
        for (const mesh of originals) mesh.setEnabled(!value);
        root.setEnabled(value);
        scene.physicsEnabled = value;
        glass.setVessel(value ? vessel : 'open');
        editor.setActive(value);
      };
    } catch (error) {
      const meshes=root.getChildMeshes();
      glass.removeContents?.(meshes);
      for (const mesh of meshes) shadows.removeShadowCaster(mesh,false);
      root.dispose();
      scene.disablePhysicsEngine();
      throw error;
    }
  }

  async function show(value) {
    desired = value;
    if (value && !session) {
      if (preparing) return;
      button.disabled = true;
      button.setAttribute('aria-busy','true');
      feedback.textContent = wording('正在准备编辑工具…','Preparing editing tools…');
      // Paint the inline status before indexing terrain and initializing physics.
      preparing = new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))).then(prepare);
      try { session = await preparing; }
      catch (error) {
        console.error(error);
        desired = false;
        writeUrl(false,true);
        feedback.textContent = wording('编辑工具未能打开，点铅笔重试。','Could not open editing tools. Select the pencil to retry.');
        return;
      } finally {
        preparing = null;
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
      feedback.textContent = '';
    }
    editing = desired;
    session?.(editing);
    onModeChange(editing);
    document.body.classList.toggle('editing',editing);
  }
  button.addEventListener('click',async () => {
    writeUrl(true);
    await show(true);
    if (editing) document.querySelector('[data-editor-tool="move"]').focus();
  });
  document.getElementById('return-to-preview').addEventListener('click',async () => {
    writeUrl(false);
    await show(false);
    button.focus();
  });
  window.addEventListener('popstate',() => {
    const route = new URLSearchParams(location.search);
    if (route.get('mode') === 'build' && (route.get('preset') !== 'fern-path' || route.get('copy') !== copyId)) {
      location.reload();
      return;
    }
    void show(route.get('mode') === 'build');
  });
  if (initialEdit) { writeUrl(true,true); return show(true); }
}
