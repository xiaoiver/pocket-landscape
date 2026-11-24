"""Bake seamless, neutral mineral grain for both pebble beds (Pillow)."""
from math import hypot, pi, sin
from pathlib import Path
from random import Random

from PIL import Image

out = Path(__file__).with_name('assets') / 'pebbles'
out.mkdir(parents=True, exist_ok=True)
size = 256
rng = Random(6724)


def field(cells):
    tile = Image.new('L', (cells, cells))
    tile.putdata([rng.randrange(256) for _ in range(cells*cells)])
    # Padding makes the bicubic neighbourhood periodic across the tile edge.
    padded = Image.new('L', (cells*3, cells*3))
    for x in range(3):
        for y in range(3):
            padded.paste(tile, (x*cells,y*cells))
    return list(padded.resize((size*3,size*3), Image.Resampling.BICUBIC)
                .crop((size,size,size*2,size*2)).getdata())


cloud, sand, flakes = (field(n) for n in [6,34,108])
height, tint, rough = [], [], []
for i in range(size*size):
    x,y = i%size/size, i//size/size
    fine = rng.uniform(-1,1)
    seam = max(0,1-abs(sin(2*pi*(2*x+y)+1.4*sin(2*pi*y)+cloud[i]/195))/.17)
    fleck = max(0,(flakes[i]-178)/77)
    height.append(.40*sand[i]/255 + .31*flakes[i]/255 + .08*fine + .10*seam)
    tint.append(round(min(255, 159+.17*cloud[i]+.11*sand[i]+26*fleck+15*seam+8*fine)))
    rough.append(round(151+.20*sand[i]+.13*cloud[i]-16*seam))

normal = []
for i in range(size*size):
    x,y = i%size, i//size
    dx = height[y*size+(x+1)%size]-height[y*size+(x-1)%size]
    dy = height[((y+1)%size)*size+x]-height[((y-1)%size)*size+x]
    length = hypot(dx,dy,1)
    normal.append(tuple(round(127.5*(1+n/length)) for n in [-dx,dy,1]))
for name,mode,pixels in [('mineral','L',tint),('normal','RGB',normal),('roughness','L',rough)]:
    image=Image.new(mode,(size,size))
    image.putdata(pixels)
    image.save(out/(name+'.png'),optimize=True)
