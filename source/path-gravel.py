"""Lay water-worn pebbles in the existing terrarium path, in Blender units."""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector, noise


def install(terrain):
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and obj.name.startswith('River gravel '):
            mesh=obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users==0:
                bpy.data.meshes.remove(mesh)

    rng = random.Random(92471)
    uniform = rng.uniform
    positions, faces, pigment, uv = [], [], [], []
    # Linear albedos: chalk, warm limestone, muted chert, cool grey and ochre.
    palette = [(.68,.58,.41), (.53,.43,.30), (.38,.33,.26),
               (.29,.30,.27), (.58,.40,.22), (.77,.70,.55)]
    neighbours = {}
    cell = .12

    def lay(x, y, radius):
        angle = math.atan2(1, 1.12*math.cos((y+.45)*2.8)) + uniform(-.85,.85)
        c, s = math.cos(angle), math.sin(angle)
        minor = radius*uniform(.59,.91)
        gx, gy = math.floor(x/cell), math.floor(y/cell)
        # Compare directional ellipse radii so small chips can fit between flats.
        for i in range(gx-2,gx+3):
            for j in range(gy-2,gy+3):
                for ox,oy,major2,minor2,c2,s2 in neighbours.get((i,j), ()):
                    dx,dy = x-ox,y-oy
                    dist = math.hypot(dx,dy)
                    if dist < .0001:
                        return
                    reach = dist/math.hypot((dx*c+dy*s)/radius, (dy*c-dx*s)/minor)
                    other = dist/math.hypot((dx*c2+dy*s2)/major2, (dy*c2-dx*s2)/minor2)
                    if dist < .96*(reach+other):
                        return
        neighbours.setdefault((gx,gy),[]).append((x,y,radius,minor,c,s))
        height = minor*uniform(.42,.78)
        z = terrain(x,y) + height*uniform(-.20,.32)
        slope_x = (terrain(x+.002,y)-terrain(x-.002,y))/.004 + uniform(-.13,.13)
        slope_y = (terrain(x,y+.002)-terrain(x,y-.002))/.004 + uniform(-.13,.13)
        tone = rng.choices(palette,weights=[26,23,12,9,9,21])[0]
        tint = uniform(.83,1.07)
        phase = uniform(0, math.tau)
        sides = 11 if radius>.028 else 8
        outline = [uniform(.89,1.08) for _ in range(sides)]
        base = len(positions)

        def vertex(u,v,w):
            dx,dy = c*u-s*v,s*u+c*v
            px,py = x+dx,y+dy
            pz = z + slope_x*dx + slope_y*dy + height*w
            positions.append((px,py,pz))
            cloud = noise.noise(Vector((px*36,py*36,pz*40)))
            light = tint*(.89+.13*w+.17*cloud)
            pigment.extend((*[t*light for t in tone],1))
            uv.append((px*1.4,py*1.4))

        vertex(0,0,-1)
        for w,spread in [(-.63,.77),(0,1),(.66,.82),(.91,.47)]:
            for i,edge in enumerate(outline):
                a = math.tau*i/sides+phase
                reach = spread*edge*uniform(.965,1.035)
                vertex(radius*(reach*math.cos(a)+.07*w),
                       minor*reach*math.sin(a), w+uniform(-.047,.047))
        vertex(radius*.07,0,1)
        for i in range(sides):
            j=(i+1)%sides
            faces.append((base,base+1+j,base+1+i))
            for row in range(3):
                k=base+1+row*sides
                faces.append((k+i,k+j,k+j+sides,k+i+sides))
            faces.append((base+1+3*sides+i,base+1+3*sides+j,base+1+4*sides))

    for tries, low, high in [(85,.047,.072),(850,.025,.049),(1600,.012,.028),(1600,.007,.014)]:
        for _ in range(tries):
            y=uniform(-1.32,1.19)
            radius=uniform(low,high)
            width=.175-.045*y+.018*math.sin(12*y)+.011*math.cos(23*y)
            x=.08+.40*math.sin((y+.45)*2.8)+uniform(-width,width)
            if math.hypot(x,y)+radius<1.315:
                lay(x,y,radius)

    name='River gravel · worn limestone and chert'
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(positions,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.polygons.foreach_set('use_smooth',[True]*len(faces))
    layer=mesh.uv_layers.new(name='Mineral grain')
    layer.data.foreach_set('uv',[n for loop in mesh.loops for n in uv[loop.vertex_index]])
    color=mesh.color_attributes.new(name='Mineral',type='FLOAT_COLOR',domain='POINT')
    color.data.foreach_set('color',pigment)
    mesh.color_attributes.active_color=color
    mat=bpy.data.materials.new('Water-worn path pebbles')
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    source=mat.node_tree.nodes.new('ShaderNodeVertexColor')
    source.layer_name=color.name
    def image_node(name, data=False):
        node=mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image=bpy.data.images.load(str(Path(__file__).with_name('assets')/'pebbles'/(name+'.png')))
        if data:
            node.image.colorspace_settings.name='Non-Color'
        node.image.pack()
        return node

    links=mat.node_tree.links
    grain=image_node('mineral')
    mix=mat.node_tree.nodes.new('ShaderNodeMix')
    mix.data_type='RGBA'
    mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1.
    links.new(source.outputs['Color'],mix.inputs[6])
    links.new(grain.outputs['Color'],mix.inputs[7])
    links.new(mix.outputs[2],shader.inputs['Base Color'])
    links.new(image_node('roughness',True).outputs['Color'],shader.inputs['Roughness'])
    normal=mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value=.46
    links.new(image_node('normal',True).outputs['Color'],normal.inputs['Color'])
    links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    mesh.materials.append(mat)
