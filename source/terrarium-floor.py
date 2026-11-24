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
            points.append((x,y,z));coverage.append(weight)
            # Warm tips on raised, dry banks; cooler hollows. Opacity multiplies
            # the material height pattern to tease individual shoots out along the soil.
            warm=smooth(-.55,.50,sample_noise(x,y,2.4,2.8))
            tints.append((.76+.24*warm,.85+.13*warm,.78+.12*(1-warm),
                          .29+.71*smooth(.015,.63,weight)))
            uvs.append((x/.68+.04*math.sin(3*y), y/.68+.035*math.sin(4*x)))
    for row in range(steps):
        for col in range(steps):
            a=row*(steps+1)+col
            face=(a,a+1,a+steps+2,a+steps+1)
            if max(coverage[i] for i in face)>.025:
                faces.append(face)
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
    for _ in range(12000):
        x,y=rng.uniform(-radius,radius),rng.uniform(-radius,radius)
        if x*x+y*y>radius*radius:continue
        h,coverage=bed(x,y)
        colony=.47+.85*sample_noise(x,y,7.8,4.2)
        if coverage<.32 or rng.random()>colony*coverage:continue
        size=rng.uniform(.008,.018)
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
