import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEditHistory} from '../source/edit-history.js';

test('redo captures the settled scene and a new edit discards the redo branch',() => {
  let scene = 'empty', buttons;
  const history = createEditHistory(() => scene, value => {scene=value;}, (...states) => {buttons=states;}, 2);
  function edit(next) {
    const previous=scene;
    scene=next;
    history.record(previous);
  }
  edit('falling stones');
  scene='settled stones';
  history.undo();
  assert.equal(scene,'empty');
  assert.deepEqual(buttons,[false,true]);
  edit('empty');
  history.redo();
  assert.equal(scene,'settled stones');
  edit('fox');
  edit('deer');
  history.undo();
  history.undo();
  history.undo();
  assert.equal(scene,'settled stones');
  edit('fern');
  assert.deepEqual(buttons,[true,false]);
  history.redo();
  assert.equal(scene,'fern');
});
