"""Turn overhanging fronds about their petioles before exporting the planted GLBs."""
import math

from mathutils import Matrix


# Radius of the planting envelope. The rolled lip reaches inward to 1.344;
# this leaves clearance for the faceted glass and for the thin sides below it.
PLANTING_RADIUS = 1.325


def inward_turn(points, anchor):
    offsets = [p-anchor for p in points]
    for degree in range(1,181):
        for sign in (1,-1):
            rotation = Matrix.Rotation(math.radians(sign*degree),3,'Z')
            rotated = [anchor + rotation @ offset for offset in offsets]
            if all(math.hypot(p.x,p.y) <= PLANTING_RADIUS for p in rotated):
                return rotation, rotated
    raise ValueError('Frond cannot fit inside the glass by turning about its petiole')


def fit_fronds(mesh, root):
    links = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        links[a].append(b)
        links[b].append(a)

    # The two scans model each frond as one connected strip. A rigid turn keeps
    # its length, droop and leaflet spacing, including the alpha-masked tips.
    pending = set(range(len(mesh.vertices)))
    original_normals = [n.vector.copy() for n in mesh.corner_normals] if mesh.has_custom_normals else []
    turns = {}
    while pending:
        stack = [pending.pop()]
        frond = []
        while stack:
            i = stack.pop()
            frond.append(i)
            for j in links[i]:
                if j in pending:
                    pending.remove(j)
                    stack.append(j)
        points = [mesh.vertices[i].co.copy() for i in frond]
        if max(math.hypot(p.x,p.y) for p in points) <= PLANTING_RADIUS:
            continue
        anchor = min(points, key=lambda p: (p-root).length_squared)
        rotation, rotated = inward_turn(points, anchor)
        for i,p in zip(frond,rotated):
            mesh.vertices[i].co = p
            turns[i] = rotation

    if turns and original_normals:
        # Corner normals come from the scan. Rotate these along with the geometry.
        for loop in mesh.loops:
            rotation = turns.get(loop.vertex_index)
            if rotation is not None:
                original_normals[loop.index] = rotation @ original_normals[loop.index]
        mesh.normals_split_custom_set(original_normals)
    mesh.update()
