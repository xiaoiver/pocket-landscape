// Capture the current pose when undo is invoked: falling pebbles may have
// settled since the user last touched the scene.
export function createEditHistory(snapshot, restore, reflect, limit=40) {
  const past = [], future = [];
  function update() { reflect(past.length > 0, future.length > 0); }
  function step(from,to) {
    if (!from.length) return;
    const current = snapshot();
    restore(from[from.length-1]);
    to.push(current);
    from.pop();
    update();
  }
  update();
  return {
    record(before) {
      if (before === snapshot()) return;
      past.push(before);
      if (past.length > limit) past.shift();
      future.length = 0;
      update();
    },
    undo:() => step(past,future),
    redo:() => step(future,past),
  };
}

export function installEditHistory(snapshot,restore,isActive=() => true) {
  const undo = document.getElementById('undo-edit'), redo = document.getElementById('redo-edit');
  const history = createEditHistory(snapshot,restore,(canUndo,canRedo) => {
    undo.disabled = !canUndo;
    redo.disabled = !canRedo;
  });
  document.getElementById('history-tools').hidden = false;
  undo.addEventListener('click',history.undo);
  redo.addEventListener('click',history.redo);
  document.addEventListener('keydown',event => {
    if (!isActive() || (!event.ctrlKey && !event.metaKey) || event.altKey || event.defaultPrevented ||
        event.target.isContentEditable || event.target.closest?.('input,textarea,select')) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && event.ctrlKey)) return;
    event.preventDefault();
    if (key === 'y' || event.shiftKey) history.redo();
    else history.undo();
  });
  return history;
}
