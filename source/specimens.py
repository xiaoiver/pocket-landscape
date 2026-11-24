"""Add harenil's Pink Angel and two Poly Haven ferns to the baseline garden.
Run inside Blender with -- <original Sketchfab source directory> <project directory>.
"""
from pathlib import Path
import math, sys
from runpy import run_path
import bpy
from mathutils import Matrix,Vector

scan, project = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:]]
assets = project/'source/assets/specimens'
bpy.ops.wm.open_mainfile(filepath=str(project/'woodland.blend'))
bpy.context.preferences.filepaths.save_version = 0
for obj in list(bpy.context.scene.objects):
    if obj.name.startswith(('Original foreground','Original fern','Fern pinnae')):
        bpy.data.objects.remove(obj,do_unlink=True)

def import_meshes(path):
    existing=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [ob for ob in bpy.data.objects if ob not in existing and ob.type=='MESH']

def prepared(obj, matrix, name):
    # Bake world placement into the mesh. This makes the same geometry usable
    # in the isolated overlay and the complete Blender garden.
    obj.data.transform(matrix)
    obj.parent=None
    obj.matrix_world=Matrix.Identity(4)
    obj.name=name
    obj.data.name=name

def land(x,y):
    from math import exp,sin,cos
    return .60+.14*(y+1)+.13*exp(-((x+.65)**2+(y-.07)**2)*4)+.075*sin(3*x+y)*cos(4*y)

fit_fronds=run_path(str(Path(__file__).with_name('fern-fit.py')))['fit_fronds']
new=[]
for fern in import_meshes(assets/'fern.gltf'):
    choices={'fern_02_b':(-.54,.52,1.72,4.05,.07),'fern_02_c':(.50,.59,1.57,3.47,-.40)}
    if fern.name not in choices:
        bpy.data.objects.remove(fern,do_unlink=True)
        continue
    x,y,width,height,angle=choices[fern.name]
    prepared(fern,Matrix.Translation((x,y,land(x,y)-.02)) @ Matrix.Rotation(angle,4,'Z') @ Matrix.Diagonal((width,width,height,1)), 'Fern 02 · '+fern.name[-1].upper())
    fit_fronds(fern.data,Vector((x,y,land(x,y)-.02)))
    new.append(fern)
plant,=import_meshes(scan/'model.glb')
# The scan includes a little soil at the roots; plant the bottom 4% in the bank.
coords=[plant.matrix_world @ v.co for v in plant.data.vertices]
lo=[min(v[i] for v in coords) for i in range(3)]
hi=[max(v[i] for v in coords) for i in range(3)]
anchor=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]+.04*(hi[2]-lo[2])))
scale=1.15/(hi[0]-lo[0]); x,y=-.61,-.28
placement=Matrix.Translation((x,y,land(x,y))) @ Matrix.Rotation(.52,4,'Z') @ Matrix.Scale(scale,4) @ Matrix.Translation(-anchor) @ plant.matrix_world
prepared(plant,placement,'Pink Angel Fittonia · harenil')
# Retain UVs for the photographic colour map and simplify the scan for the viewer.
bpy.context.view_layer.objects.active=plant
m=plant.modifiers.new('Web geometry','DECIMATE');m.ratio=.40
bpy.ops.object.modifier_apply(modifier=m.name)
for mat in plant.data.materials:
    if not mat or not mat.use_nodes:continue
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            image=node.image
            image.scale(2048,2048)
            image.pack()
new.append(plant)
bpy.ops.object.select_all(action='DESELECT')
for ob in new:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(assets/'plants.glb'),export_format='GLB',use_selection=True,export_animations=False)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(project/'woodland-specimens.blend'))
bpy.ops.export_scene.gltf(filepath=str(project/'woodland-specimens.glb'),export_format='GLB',export_animations=False)
