async function unpack(element) {
  const bytes = Uint8Array.from(atob(element.textContent.trim()),ch => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function readModelBytes(id) {
  const element = document.getElementById(id);
  if (!element.dataset.parts) return new Uint8Array(await unpack(element));
  const parts = await Promise.all(element.dataset.parts.split(' ').map(key => unpack(document.getElementById(key))));
  const bytes = new Uint8Array(parts.reduce((length,part) => length+part.byteLength,0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(new Uint8Array(part),offset);
    offset += part.byteLength;
  }
  return bytes;
}
