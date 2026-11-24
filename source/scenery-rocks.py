"""Place the six Rock Moss Set 01 scans in the planted bank (Blender Z-up)."""
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


# Scan ID, x/y centre, longest horizontal extent, yaw, fraction buried, triangle budget.
STONES = [
    ('04', -.36,  .18, .62, -.48, .23, 3800),  # Tall split face between the ferns
    ('03', -.61,  .25, .27, 1.16, .28, 1000),
    ('06',  .61, -.12, .53,  .86, .19, 2900),  # Broad shoulder behind the fox
    ('02',  .72, -.28, .24, -.63, .26, 1000),
    ('01', -.54, -.53, .35, 1.17, .20, 2100),  # Low slab beneath the Pink Angel
    ('05',  .32,  .53, .41, -.87, .24, 1700),
]


def install(terrain, bed):
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.name.startswith(('Weathered granite ', 'Woodland outcrop ')):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)

    asset = Path(__file__).with_name('assets')/'rock-moss'/'rock_moss_set_01.gltf'
    bpy.ops.import_scene.gltf(filepath=str(asset))
    imported = {obj.name: obj for obj in bpy.context.selected_objects if obj.type == 'MESH'}
    for scan, x, y, width, yaw, burial, budget in STONES:
        obj = imported['rock_moss_set_01_rock'+scan]
        bpy.context.view_layer.objects.active = obj
        simplify = obj.modifiers.new('Preserve scanned silhouette', 'DECIMATE')
        simplify.ratio = min(1, budget/len(obj.data.polygons))
        bpy.ops.object.modifier_apply(modifier=simplify.name)

        # Ignore the preview layout in the source file. Work in world space first
        # so the imported axis conversion is retained in the baked geometry.
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
        coords = [v.co for v in obj.data.vertices]
        low = Vector(tuple(min(p[i] for p in coords) for i in range(3)))
        high = Vector(tuple(max(p[i] for p in coords) for i in range(3)))
        extent = high-low
        scale = width/max(extent.x, extent.y)
        anchor = (low+high)*.5
        anchor.z = low.z+burial*extent.z
        normal = Vector((terrain(x-.002,y)-terrain(x+.002,y),
                         terrain(x,y-.002)-terrain(x,y+.002), .004)).normalized()
        # Seat the base in the soil and let the existing moss overlap its lower edge.
        soil = terrain(x,y)
        moss, _ = bed(x,y)
        z = soil+.45*max(0,moss-soil)
        placement = (Matrix.Translation((x,y,z))
                     @ Vector((0,0,1)).rotation_difference(normal).to_matrix().to_4x4()
                     @ Matrix.Rotation(yaw,4,'Z') @ Matrix.Scale(scale,4)
                     @ Matrix.Translation(-anchor))
        obj.data.transform(placement)
        obj.name = obj.data.name = 'Woodland outcrop · '+scan
    for slot in imported['rock_moss_set_01_rock04'].material_slots:
        for node in slot.material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and not node.image.packed_file:
                node.image.pack()
