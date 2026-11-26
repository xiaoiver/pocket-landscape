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

// The public route is served without a trailing slash. Loading one figurine
// must neither request the other models nor keep a failed download cached.
const files = new Map();
const requested = [];
for (const script of packModels(models,(id,bytes) => {
  const file = 'assets/'+id+'.bin';
  files.set('/experiences/pocket-landscape/'+file,bytes);
  return '<script type="application/octet-stream" id="'+id+'" data-file="'+file+'"></script>';
})) {
  const [,id,parts,file] = script.match(/id="([^"]+)"(?: data-parts="([^"]+)")?(?: data-file="([^"]+)")?/);
  elements.set(id,{id,dataset:{parts,file}});
}
globalThis.location = new URL('https://example.test/experiences/pocket-landscape?mode=build');
globalThis.fetch = async url => {
  requested.push(url.pathname);
  const bytes = files.get(url.pathname);
  return bytes && requested.length > 1 ? new Response(bytes) : new Response(null,{status:404});
};
await assert.rejects(readModelBytes('animal-deer'),/HTTP 404/);
assert(Buffer.from(await readModelBytes('animal-deer')).equals(models['animal-deer']));
assert.deepEqual(requested,Array(2).fill('/experiences/pocket-landscape/assets/animal-deer.bin'));
