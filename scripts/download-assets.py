#!/usr/bin/env python3
"""Re-download the bundled CC0 source files; requires only Python's standard library."""
import json
from pathlib import Path
from urllib.request import urlopen, urlretrieve

root = Path(__file__).resolve().parents[1] / 'public' / 'assets'
with urlopen('https://api.polyhaven.com/files/moss_01', timeout=30) as response:
    files = json.load(response)
gltf = files['gltf']['1k']['gltf']
for relative, item in [('moss_01_1k.gltf', gltf), *gltf['include'].items()]:
    target = root / 'moss' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    urlretrieve(item['url'], target)
urlretrieve(files['Alpha']['1k']['png']['url'], root / 'moss/textures/moss_01_alpha_1k.png')
(root / 'environment').mkdir(parents=True, exist_ok=True)
urlretrieve('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr', root / 'environment/studio_small_09_1k.hdr')
print('Downloaded Moss 01 and Studio Small 09 (CC0). See public/assets/CREDITS.md.')
