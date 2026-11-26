const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const {packModels, embeddedData} = require('./pack-models.cjs');

const project = path.resolve(__dirname, '..');
async function buildViewer() {
  const bundle = await build({
    entryPoints: [path.join(__dirname, 'scene.js')],
    bundle: true, write: false, format: 'iife', minify: true,
    legalComments: 'inline',
  });
  const model = fs.readFileSync(path.join(project, 'woodland.glb'));
  const studio = fs.readFileSync(path.join(__dirname, 'assets/studio_small_09_1k.hdr'));
  const specimens = fs.readFileSync(path.join(__dirname, 'assets/specimens/plants.glb'));
  const substrate = ['humus','humus-normal','roughness'].map(key =>
    embeddedData('substrate-'+key, fs.readFileSync(path.join(__dirname, 'assets/substrate', key+'.jpg'))));
  const animalNames = {fox:['狐狸','Fox'], deer:['小鹿','Fawn'], hedgehog:['刺猬','Hedgehog']};
  const figurine = (name, extension) => fs.readFileSync(path.join(__dirname, 'assets/terrarium', name+'.'+extension));
  const animals = Object.entries(animalNames).map(([id, [label, english]]) =>
    '<button class="animal" data-animal="'+id+'" aria-label="'+label+'" data-en="'+english+'" aria-pressed="'+(id==='fox')+'"><img alt="" src="data:image/png;base64,'+
    figurine(id,'png').toString('base64')+'"></button>').join('');
  const models = {'model-data':model, 'specimen-data':specimens, 'book-data':fs.readFileSync(path.join(__dirname,'assets/desk-books.glb'))};
  for (const id of Object.keys(animalNames)) models['animal-'+id] = figurine(id,'glb');
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const havokWasm = require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm');
  const havokLicense = fs.readFileSync(path.resolve(path.dirname(havokWasm),'../../LICENSE'),'utf8');
  const bookLicense = fs.readFileSync(path.join(__dirname,'assets/irma-book-LICENSE.txt'),'utf8');
  const content = ['<!-- irma-book binding geometry\n'+bookLicense+'-->', '<!-- @babylonjs/havok\n' + havokLicense + '-->', embeddedData('studio-data', studio),
    embeddedData('havok-wasm',fs.readFileSync(havokWasm)),
    embeddedData('window-view', fs.readFileSync(path.join(__dirname, 'assets/window-morning.jpg'))),
    embeddedData('window-detail', fs.readFileSync(path.join(__dirname, 'assets/window-refraction.jpg'))),
    embeddedData('drop-atlas', fs.readFileSync(path.join(__dirname, 'assets/window-drop-atlas.png'))),
    ...packModels(models), ...substrate, '<script>' + script + '</script>'].join('\n');
  const template = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
  fs.writeFileSync(path.join(project, 'index.html'), template.replace('<!--LOADING-FOX-->', 'data:image/png;base64,' + figurine('fox','png').toString('base64')).replace('<!--ANIMALS-->', () => animals).replace('<!--APP-->', () => content));
}
buildViewer().catch(error => { console.error(error); process.exitCode = 1; });
