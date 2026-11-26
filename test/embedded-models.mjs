import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packModels} from '../source/pack-models.cjs';
import {readModelBytes} from '../source/embedded-model.js';

const asset = path => readFileSync(new URL('../'+path,import.meta.url));
const models = {
  'model-data':asset('woodland.glb'),
  'animal-fox':asset('source/assets/terrarium/fox.glb'),
  'animal-deer':asset('source/assets/terrarium/deer.glb'),
};
const elements = new Map();
for (const script of packModels(models)) {
  const [,id,parts,textContent] = script.match(/^<script type="application\/octet-stream" id="([^"]+)"(?: data-parts="([^"]+)")?>([^<]*)<\/script>$/);
  assert(!elements.has(id));
  elements.set(id,{textContent,dataset:{parts}});
}
const parts = id => elements.get(id).dataset.parts.split(' ');
const shared = parts('model-data').filter(id => parts('animal-fox').includes(id));
assert.equal(new Set(shared).size,3);
assert.equal(elements.get('animal-deer').dataset.parts,undefined);
globalThis.document = {getElementById:id => elements.get(id)};
for (const [id,glb] of Object.entries(models)) {
  assert(Buffer.from(await readModelBytes(id)).equals(glb),id+' must round-trip byte for byte');
}
