async function unpack(element) {
  let body;
  if (element.dataset.file) {
    // The hosted page also has an extensionless URL without a trailing slash.
    const base = new URL(location.href);
    if (!base.pathname.endsWith('/') && !base.pathname.endsWith('/index.html')) base.pathname += '/';
    const response = await fetch(new URL(element.dataset.file,base));
    if (!response.ok) throw new Error('Could not load '+element.id+' (HTTP '+response.status+')');
    body = response.body;
  } else {
    const bytes = Uint8Array.from(atob(element.textContent.trim()),ch => ch.charCodeAt(0));
    body = new Blob([bytes]).stream();
  }
  const stream = body.pipeThrough(new DecompressionStream('gzip'));
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
