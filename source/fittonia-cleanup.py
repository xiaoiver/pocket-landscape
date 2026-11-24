"""Remove spurious reconstruction patches from the placed Pink Angel scan."""
import bmesh
from bpy_extras.mesh_utils import mesh_linked_uv_islands
from mathutils import Vector
from mathutils.geometry import area_tri, intersect_point_tri_2d


# UV picks on the torn skirt and the floating shard below the outer leaf.
# These two islands carry projected colour, unlike the untextured fillers.
TORN_PATCHES = (Vector((0.07525, 0.80933)), Vector((0.62431, 0.37146)))

# This chart continues from a real stalk onto the false side wall of the leaf.
OUTER_LEAF_SIDE = Vector((0.06400, 0.39081))


def remove_scan_fillers(mesh):
    # The scan assigns hole-fill patches tiny atlas islands. Measure the whole
    # island so a narrow but properly photographed leaf tip is kept intact.
    uvs = mesh.uv_layers.active.data
    rejected = []
    for island in mesh_linked_uv_islands(mesh):
        surface_area = 0.0
        atlas_area = 0.0
        torn = False
        outer_side = False
        for index in island:
            face = mesh.polygons[index]
            surface_area += face.area
            triangle = [uvs[i].uv for i in face.loop_indices]
            atlas_area += area_tri(*triangle)
            torn = torn or any(intersect_point_tri_2d(p, *triangle) for p in TORN_PATCHES)
            outer_side = outer_side or intersect_point_tri_2d(OUTER_LEAF_SIDE, *triangle)
        # In the baked garden coordinates the two groups fall below 0.0001
        # and above 0.03 respectively (UV area per square scene unit).
        if torn or atlas_area < 0.001 * surface_area:
            rejected.extend(island)
        elif outer_side:
            # The attachment is on the negative-Y side of the planted scan.
            rejected.extend(i for i in island if mesh.polygons[i].center.y > 0)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in rejected], context='FACES')
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
