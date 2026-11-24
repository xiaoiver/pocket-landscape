const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const project = path.resolve(__dirname, '..');
function embeddedData(id, bytes) {
  return '<script type="application/octet-stream" id="' + id + '">' + bytes.toString('base64') + '</script>';
}
async function buildViewer() {
  const bundle = await build({
    entryPoints: [path.join(__dirname, 'scene.js')],
    bundle: true, write: false, format: 'iife', minify: true,
    legalComments: 'inline',
  });
  const model = zlib.gzipSync(fs.readFileSync(path.join(project, 'woodland.glb')));
  const studio = fs.readFileSync(path.join(__dirname, 'assets/studio_small_09_1k.hdr'));
  const shadow = fs.readFileSync(path.join(__dirname, 'assets/specimens/shadow.png'));
  const specimens = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'assets/specimens/plants.glb')));
  const substrate = ['normal','roughness'].map(key =>
    embeddedData('substrate-'+key, fs.readFileSync(path.join(__dirname, 'assets/substrate', key+'.jpg'))));
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const content = [embeddedData('studio-data', studio), embeddedData('shadow-data', shadow),
    embeddedData('specimen-data', specimens), embeddedData('model-data', model), ...substrate, '<script>' + script + '</script>'].join('\n');
  const template = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
  fs.writeFileSync(path.join(project, 'index.html'), template.replace('<!--APP-->', () => content));
}
buildViewer().catch(error => { console.error(error); process.exitCode = 1; });
