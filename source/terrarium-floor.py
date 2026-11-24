"""Build a continuous terrarium moss surface and set the Tripo figurine on the soil.
Used by model.py and by the Blender workflow for refreshing an existing garden.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Matrix, Vector, noise

ASSETS = Path(__file__).resolve().parent / 'assets' / 'terrarium'
FOX_X, FOX_Y = .39, -.58
GRID_STEP = .018

def terrain(x, y):
    return (.60 + .14*(y+1) + .13*math.exp(-4*((x+.65)**2+(y-.07)**2))
            + .075*math.sin(3*x+y)*math.cos(4*y))

def sample_noise(x, y, scale, seed):
    return noise.noise(Vector((x*scale, y*scale, seed)), noise_basis='PERLIN_NEW')

def smooth(a,b,t):
    t = min(1.,max(0.,(t-a)/(b-a)))
    return t*t*(3-2*t)

def bed(x,y):
    """Signed growth height. Margins taper through the soil, including along the path."""
    broad = sample_noise(x,y,3.2,1.7)
    fine = sample_noise(x,y,12.5,5.1)
    path = .08+.40*math.sin((y+.45)*2.8)
    clearance = abs(x-path) - (.175-.045*y) - .020 + .060*fine
    rim = 1.31-math.hypot(x,y) + .010*fine
    footprint = math.hypot((x-FOX_X)/.225,(y-FOX_Y)/.24)
    edge = smooth(-.018,.117,clearance)*smooth(.002,.094,rim)*smooth(.58,1.13,footprint)
    growth = smooth(-.51,-.13,broad+.36*fine)
    relief = .036 + .062*(broad+.45) + .026*fine + .010*sample_noise(x,y,32,7.8)
    return terrain(x,y) - .006 + edge*growth*max(.015,relief), edge*growth

# Crossing from the edge of the pebble path to the fox's near paw, then
# closing in again at the bend behind the figurines (Blender XY).
CUSHIONS = (
    (.225, -.84, .143, .106, .070),
    (.075, -.73, .14, .115, .083),
    (.265, -.962, .091, .078, .058),
    (.56, -.04, .19, .16, .085),
)

def cushion(x, y):
    height = cover = 0.
    for cx, cy, rx, ry, peak in CUSHIONS:
        u, v = (x-cx)/rx, (y-cy)/ry
        if abs(u)>1.25 or abs(v)>1.25:
            continue
        d = math.hypot(u+.18*v, v) + .11*sample_noise(x,y,21,3.4)
        skirt = 1.-smooth(.18,1.08,d)
        height = max(height, peak*skirt)
        cover = max(cover, 1.-smooth(.75,1.12,d))
    return height, cover

def planted_bed(x,y):
    h, coverage = bed(x,y)
    lift, colony = cushion(x,y)
    return h+lift, max(coverage,colony)

def surface_object(name,points,faces):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.polygons.foreach_set('use_smooth',[True]*len(mesh.polygons))
    return obj

def make_moss():
    radius=1.32
    steps=math.ceil(2*radius/GRID_STEP)
    points=[];uvs=[];coverage=[];faces=[];tints=[]
    for row in range(steps+1):
        y=radius*(2*row/steps-1)
        for col in range(steps+1):
            x=radius*(2*col/steps-1)
            z,weight=bed(x,y)
            lift,colony=cushion(x,y)
            z+=lift
            weight=max(weight,colony)
            toe=1.-.19*colony*(1.-smooth(.008,.066,lift))
            points.append((x,y,z));coverage.append(weight)
            # Warm tips on raised, dry banks; cooler hollows. Opacity multiplies
            # the material height pattern to tease individual shoots out along the soil.
            warm=smooth(-.55,.50,sample_noise(x,y,2.4,2.8))
            tints.append((toe*(.76+.24*warm),toe*(.85+.13*warm),toe*(.78+.12*(1-warm)),
                          .29+.71*smooth(.015,.63,weight)))
            uvs.append((x/.68+.04*math.sin(3*y), y/.68+.035*math.sin(4*x)))
    for row in range(steps):
        for col in range(steps):
            a=row*(steps+1)+col
            face=(a,a+1,a+steps+2,a+steps+1)
            if max(coverage[i] for i in face)>.025:
                faces.append(face)
    # A tongue of moss curls over the front shoulder into the soil
    # against the glass. The top rows overlap the bank, the lower rows taper.
    for j in range(7):
        t=j/6
        for i in range(31):
            a=-2.37+.20*i/30
            envelope=math.sin(math.pi*i/30)**.8
            fringe=envelope*(.072+.023*math.sin(79*a)+.010*math.sin(162*a))
            r=1.22+.105*math.sin(min(t*2,1)*math.pi/2)
            x,y=r*math.cos(a),r*math.sin(a)
            shoulder=1.-smooth(.08,.48,t)
            h=terrain(x,y)
            z=h+shoulder*(bed(x,y)[0]-h-.002)+.012*envelope-fringe*t**1.45
            points.append((x,y,z))
            uvs.append((x/.68+.04*math.sin(3*y),(y+fringe*t)/.68+.035*math.sin(4*x)))
            tints.append((.68,.80,.62,envelope*(1.-.82*t*t)))
            if i and j:
                k=len(points)-1
                faces.append((k-31,k-32,k-1,k))
    mat=bpy.data.materials.new('Moss · soft hummocks');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.94
    for slot,filename in [('Base Color','moss-color.png'),('Normal','moss-normal.jpg')]:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image=bpy.data.images.load(str(ASSETS/filename));node.image.pack()
        output=node.outputs['Color']
        if slot=='Normal':
            node.image.colorspace_settings.name='Non-Color'
            normal=mat.node_tree.nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value=.58
            mat.node_tree.links.new(output,normal.inputs['Color'])
            output=normal.outputs['Normal']
        mat.node_tree.links.new(output,shader.inputs[slot])
    obj=surface_object('Cushion moss · continuous bank',points,faces)
    tint=obj.data.color_attributes.new(name='Bank colour',type='BYTE_COLOR',domain='POINT')
    tint.data.foreach_set('color',[v for pixel in tints for v in pixel])
    obj.data.color_attributes.active_color=tint
    # glTF multiplies COLOR_0 into the sampled texture, including alpha.
    color_node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.name.startswith('moss-color'))
    cutoff=mat.node_tree.nodes.new('ShaderNodeMath');cutoff.operation='GREATER_THAN'
    cutoff.inputs[1].default_value=.52
    mat.node_tree.links.new(color_node.outputs['Alpha'],cutoff.inputs[0])
    mat.node_tree.links.new(cutoff.outputs[0],shader.inputs['Alpha'])
    obj.data.materials.append(mat)
    layer=obj.data.uv_layers.new(name='Moss scale')
    layer.data.foreach_set('uv',[v for loop in obj.data.loops for v in uvs[loop.vertex_index]])

    # Flattened, folded leaflets break up the silhouette only where colonies are dense.
    rng=random.Random(411);points=[];faces=[];colors=[]
    def rosette(x,y,h,size):
        angle=rng.random()*math.tau
        shade=rng.uniform(.75,1.14)
        center=len(points);points.append((x,y,h-.0005));colors.append((.045*shade,.068*shade,.018*shade,1))
        for j in range(6):
            a=angle+math.tau*j/6+rng.uniform(-.22,.22);dx,dy=math.cos(a),math.sin(a)
            length=size*rng.uniform(.70,1.16);width=.19*length
            midx=x+dx*length*.52;midy=y+dy*length*.52
            k=len(points)
            points.extend([(midx-dy*width,midy+dx*width,h+.24*length),
                           (midx,midy,h+.44*length),
                           (midx+dy*width,midy-dx*width,h+.22*length),
                           (x+dx*length,y+dy*length,h+.52*length)])
            colors.extend([(r*shade,g*shade,b*shade,1) for r,g,b in
                           ((.068,.119,.025),(.106,.156,.039),(.072,.121,.029),(.16,.199,.055))])
            faces.extend([(center,k+1,k),(center,k+2,k+1),(k,k+1,k+3),(k+1,k+2,k+3)])
    for _ in range(12000):
        x,y=rng.uniform(-radius,radius),rng.uniform(-radius,radius)
        if x*x+y*y>radius*radius:continue
        h,coverage=bed(x,y)
        colony=.47+.85*sample_noise(x,y,7.8,4.2)
        if coverage<.32 or rng.random()>colony*coverage:continue
        rosette(x,y,h+cushion(x,y)[0],rng.uniform(.008,.018))
    # Short folded tips along the crowns make the low-angle silhouette fuzzy.
    for cx,cy,rx,ry,peak in CUSHIONS:
        for _ in range(round(rx*ry*7200)):
            x,y=cx+rng.uniform(-rx,rx),cy+rng.uniform(-ry,ry)
            lift,cover=cushion(x,y)
            if rng.random()<cover*.88:
                rosette(x,y,bed(x,y)[0]+lift,rng.uniform(.007,.015))
    obj=surface_object('Living moss · rosettes',points,faces)
    pigment=obj.data.color_attributes.new(name='Pigment',type='BYTE_COLOR',domain='POINT')
    pigment.data.foreach_set('color',[v for rgba in colors for v in rgba])
    # glTF exports this active colour layer as COLOR_0, multiplied by white.
    obj.data.color_attributes.active_color=pigment
    mat=bpy.data.materials.new('Moss · leaf tips');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    node=mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Pigment'
    mat.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value=.88
    obj.data.materials.append(mat)


def dress_path_edge(rosettes, gravel):
    """Turn a few existing shoots toward the exposed lips of three foreground stones."""
    mesh = rosettes.data
    # make_moss emits a shared root followed by four vertices per folded leaf.
    roots = [i for i in range(0, len(mesh.vertices), 1 + 6*4)
             if -.99 < mesh.vertices[i].co.y < -.48 and -.08 < mesh.vertices[i].co.x < .31]
    rng = random.Random(821)
    down = Vector((0, 0, -1))
    # Blender XY centres in the seeded gravel layout, on the figurine's side.
    for cx, cy, bearings in [
        (-.076, -.868, (-66, -41, -25, 8, 25)),
        (-.046, -.759, (-62, -35, -13, 12)),
        (.027, -.639, (-56, -26, 7)),
    ]:
        for bearing in bearings:
            angle = math.radians(bearing)
            dx, dy = math.cos(angle), math.sin(angle)
            # Follow the actual stone outline down to its intersection with the bank.
            for step in range(1, 35):
                x, y = cx + .003*step*dx, cy + .003*step*dy
                hit, surface, _, _ = gravel.ray_cast(Vector((x, y, 2)), down)
                if not hit or surface.z < max(terrain(x,y), planted_bed(x,y)[0]):
                    break
            else:
                continue
            gap = rng.uniform(.010, .017)
            x, y = x + gap*dx, y + gap*dy
            origin = Vector((x, y, max(terrain(x,y), planted_bed(x,y)[0]) - .0005))
            hit, surface, _, _ = gravel.ray_cast(Vector((x, y, 2)), down)
            if hit and surface.z > origin.z + .001:
                continue

            root = min(roots, key=lambda i: (mesh.vertices[i].co - origin).length_squared)
            roots.remove(root)
            old = mesh.vertices[root].co.copy()
            inward = Vector((-dx, -dy))
            # Stretch only the leaflet already pointing at the stone.
            leaves = range(root+1, root+25, 4)
            leading = max(leaves, key=lambda i: (mesh.vertices[i+3].co-old).xy.normalized().dot(inward))
            reach = rng.uniform(1.55, 1.90)
            mesh.vertices[root].co = origin
            for start in leaves:
                for v in mesh.vertices[start:start+4]:
                    offset = v.co - old
                    if start == leading:
                        offset.x *= reach
                        offset.y *= reach
                        offset.z *= 1.35
                    v.co = origin + offset
    mesh.update()

def lower_path_leaves(plant):
    # The two low, inward-facing ivory leaves share their original petioles.
    # Bend the blade progressively from the midrib, preserving its attached end.
    verts = plant.data.vertices
    for start in range(0,len(verts),15*9):
        root=verts[start+4].co
        tip=verts[start+14*9+4].co
        if root.z>1 or tip.x>=root.x-.12:
            continue
        for row in range(1,15):
            t=row/14
            for v in verts[start+row*9:start+(row+1)*9]:
                v.co.y-=.13*t*t
                v.co.z-=.15*t*t
    plant.data.update()

def install():
    for ob in list(bpy.context.scene.objects):
        if ob.name.startswith(('Cushion moss','Living moss','Fox ·')):
            bpy.data.objects.remove(ob,do_unlink=True)
    make_moss()
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/'fox.glb'))
    fox,=[ob for ob in bpy.data.objects if ob not in before and ob.type=='MESH']
    x,y=FOX_X,FOX_Y
    normal=Vector((-(terrain(x+.002,y)-terrain(x-.002,y))/.004,
                   -(terrain(x,y+.002)-terrain(x,y-.002))/.004,1)).normalized()
    # Rotate the local vertical onto the soil normal without changing its bearing.
    placement=(Matrix.Translation((x,y,terrain(x,y)-.004))
               @ Vector((0,0,1)).rotation_difference(normal).to_matrix().to_4x4()
               @ Matrix.Rotation(-.17,4,'Z'))
    fox.data.transform(placement@fox.matrix_world);fox.matrix_world=Matrix.Identity(4)
    fox.name=fox.data.name='Fox · Tripo terracotta'
