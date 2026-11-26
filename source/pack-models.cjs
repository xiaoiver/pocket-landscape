const {createHash} = require('node:crypto');
const {gzipSync} = require('node:zlib');

// Only embedded image views can be shared. All other GLB bytes, including
// JSON, geometry and alignment padding, stay in their original order.
function imageRanges(glb) {
  const jsonEnd = 20 + glb.readUInt32LE(12);
  const {images = [], bufferViews} = JSON.parse(glb.toString('utf8',20,jsonEnd));
  const embeddedViews = new Set(images.map(image => image.bufferView).filter(index => index !== undefined));
  const ranges = [];
  for (const index of embeddedViews) {
    const view = bufferViews[index];
    if (view.buffer !== 0) continue;
    const start = jsonEnd + 8 + (view.byteOffset ?? 0);
    const end = start + view.byteLength;
    const hash = createHash('sha256').update(glb.subarray(start,end)).digest('hex');
    ranges.push({start,end,hash});
  }
  return ranges.sort((a,b) => a.start-b.start);
}

function embeddedData(id, bytes) {
  return '<script type="application/octet-stream" id="' + id + '">' + bytes.toString('base64') + '</script>';
}

function packModels(models, emitChunk = embeddedData) {
  const entries = Object.entries(models).map(([id,glb]) => ({id,glb,images:imageRanges(glb)}));
  const counts = new Map();
  for (const {images} of entries) {
    for (const {hash} of images) counts.set(hash,(counts.get(hash) ?? 0)+1);
  }

  const scripts = [], shared = new Map();
  function chunk(id,bytes) {
    scripts.push(emitChunk(id,gzipSync(bytes)));
    return id;
  }
  for (const {id,glb,images} of entries) {
    const parts = [];
    let offset = 0;
    function appendLocal(end) {
      if (offset < end) parts.push(chunk(id+'-'+parts.length,glb.subarray(offset,end)));
    }
    for (const {start,end,hash} of images) {
      if (counts.get(hash) === 1 || start < offset) continue;
      appendLocal(start);
      if (!shared.has(hash)) shared.set(hash,chunk('shared-texture-'+shared.size,glb.subarray(start,end)));
      parts.push(shared.get(hash));
      offset = end;
    }
    if (parts.length) {
      appendLocal(glb.length);
      scripts.push('<script type="application/octet-stream" id="'+id+'" data-parts="'+parts.join(' ')+'"></script>');
    } else chunk(id,glb);
  }
  return scripts;
}
module.exports = {packModels,embeddedData};
