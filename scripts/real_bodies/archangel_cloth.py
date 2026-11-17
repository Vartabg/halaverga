"""Archangel's asymmetric chiton and fittings, built in the baked body's Z-up frame."""
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import materials
import shells
import skirt

# The left panels fall lower. Each hem stays above the knee and follows its own thigh.
HEMS = {'front_l': .025, 'side_l': -.015, 'back_l': -.025, 'back_r': .050, 'side_r': .080, 'front_r': .095}


def neckline(neck, x):
    return neck.z - .135 + .68 * (x - neck.x)


def covers(rig, neck, co, bone):
    if co.z > neckline(neck, co.x):
        return False
    if bone == 'upperarm_l':
        return shells.along(rig, bone, co) < .30
    return bone in skirt.TORSO or bone.startswith('clavicle')


def bind_edge(inner, neck):
    """Sample the binding by distance to the neckline so it crosses triangle edges smoothly."""
    uv = materials.palette_uv(inner)
    u, base = materials.SWATCH['cloth']
    for loop in inner.data.loops:
        x, _, z = inner.data.vertices[loop.vertex_index].co
        gap = min(1, max(0, (neckline(neck, x) - z) / .085))
        uv.data[loop.index].uv = (u, base + .20 * (1 - gap))


def clasp(inner, neck):
    """A raised diamond pin, projected onto the cloth and bound to the weights below it."""
    verts = [v.co for v in inner.data.vertices]
    faces = [f.vertices[:] for f in inner.data.polygons]
    surface = BVHTree.FromPolygons(verts, faces)
    groups = {g.index: g.name for g in inner.vertex_groups}
    offsets = ((0, .041), (.034, 0), (0, -.041), (-.034, 0))
    center = Vector((neck.x + .145, -1, neck.z - .140))
    coords, weights = [], []
    for scale, relief in ((1, .005), (.65, .013), (0, .021)):
        for x, z in offsets if scale else ((0, 0),):
            hit, normal, face, _ = surface.ray_cast(center + Vector((scale * x, 0, scale * z)), Vector((0, 1, 0)))
            if hit is None or normal.y >= 0:
                raise ValueError('archangel clasp must sit on the front of the chiton')
            nearest = min(faces[face], key=lambda i: (verts[i] - hit).length_squared)
            weights.append({groups[g.group]: g.weight for g in inner.data.vertices[nearest].groups})
            coords.append(hit + Vector((0, -relief, 0)))
    rim = [(i, i + 4, (i + 1) % 4 + 4, (i + 1) % 4) for i in range(4)]
    crown = [(i + 4, 8, (i + 1) % 4 + 4) for i in range(4)]
    return skirt.panel_mesh('diamond clasp', coords, rim + crown, weights, ['bronze'] * 4 + ['trim'] * 4)


def guard(body, rig):
    """A leather wrap on the free forearm, leaving the elbow, wrist and cannon mount clear."""
    bone = 'lowerarm_l'
    obj = shells.shell(body, 'forearm wrap',
                       lambda co, d: d == bone and .28 < shells.along(rig, bone, co) < .91,
                       .011, smooth=8, edge_smooth=6)
    shells.decimate_inside(obj, 300)

    uv = materials.palette_uv(obj)
    u, base = materials.SWATCH['leather']
    for loop in obj.data.loops:
        t = shells.along(rig, bone, obj.data.vertices[loop.vertex_index].co)
        band = min(1, max(0, (t - .71) / .16))
        uv.data[loop.index].uv = (u, base + .36 * band)
    return obj
