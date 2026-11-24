"""Project the actual planted silhouette into a soft window shadow for the tabletop."""
from PIL import Image,ImageDraw,ImageFilter
import json, math, struct,sys
from pathlib import Path
blob=Path(sys.argv[1]).read_bytes()
n=struct.unpack_from('<I',blob,12)[0]
doc=json.loads(blob[20:20+n]);base=28+n
def rows(idx,fmt):
    a=doc['accessors'][idx]; v=doc['bufferViews'][a['bufferView']];start=base+v.get('byteOffset',0)+a.get('byteOffset',0)
    size=struct.calcsize('<'+fmt)
    return [struct.unpack_from('<'+fmt,blob,start+i*v.get('byteStride',size)) for i in range(a['count'])]
size=640; span=8
mask=Image.new('L',(size,size));draw=ImageDraw.Draw(mask)
for mesh in doc['meshes']:
    if mesh['name'].startswith(('Living moss','River gravel','Cushion moss')):continue
    for prim in mesh['primitives']:
        vs=rows(prim['attributes']['POSITION'],'fff');idx=prim['indices'];fmt={5123:'H',5125:'I',5121:'B'}[doc['accessors'][idx]['componentType']]
        indices=[r[0] for r in rows(idx,fmt)]
        coords=[((.5+(x+.64*y)/span)*size,(.5+(z-.33*y)/span)*size) for x,y,z in vs]
        for i in range(0,len(indices),3):draw.polygon([coords[k] for k in indices[i:i+3]],fill=110)
mask=mask.filter(ImageFilter.GaussianBlur(5));contact=Image.new('L',mask.size);d=ImageDraw.Draw(contact)
r=1.30*size/span;d.ellipse((size/2-r,size/2-r,size/2+r,size/2+r),fill=120);contact=contact.filter(ImageFilter.GaussianBlur(3))
from PIL import ImageChops
mask=ImageChops.screen(mask,contact)
out=Image.new('RGBA',mask.size,(67,62,49));out.putalpha(mask);out.save(sys.argv[2])
