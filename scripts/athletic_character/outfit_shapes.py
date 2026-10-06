"""Shape tools for the Meridian Envoy outfit (outfit.py): cutting a piece from the body's own surface, the boots, the flight module
and smoothing. Source pose: Z up, front -Y, metres."""
from math import atan2, radians
import bmesh
import bpy
from mathutils import Matrix, Vector

BONE = (0.91, 0.89, 0.84, 1.0)        # ceramic plates, display sRGB
GRAPHITE = (0.11, 0.115, 0.13, 1.0)   # boots, glove, module body
TEAL = (0.12, 0.95, 0.85)
# Limb axes in the source pose (rig.POINTS), y moved to each limb's measured cross-section centre.
ARM = {s: (Vector((s*.223, -.01, 1.492)), Vector((s*.344, -.01, 1.242)), Vector((s*.421, -.01, 1.003))) for s in (-1, 1)}
LEG = {s: (Vector((s*.100, -.02, .962)), Vector((s*.143, .015, .513)), Vector((s*.189, .065, .112))) for s in (-1, 1)}



def axis_param(p, a, b):
    """Position along a limb segment (0 at a, 1 at b) and the angle around it, 0 facing front (-Y), positive toward +X."""
    ab = b-a
    t = (p-a).dot(ab)/ab.length_squared
    r = (p-a)-ab*t
    side = ab.cross(Vector((0, -1, 0))).normalized()
    front = side.cross(ab).normalized()
    return t, atan2(r.dot(side), r.dot(front))


def cut(source, name, keep, lift, colour, thick=.006, smooth=6, rim=True, every=False):
    """The faces of `source` (a mesh in source coordinates) whose vertices all pass `keep` (the largest connected piece, or `every`
    piece for a seam), lifted `lift` m along their normals and the ragged border relaxed. finish() thickens it later: `thick` m of rim
    toward the body, carrying the glow if `rim`. Returns an object in the scene."""
    bm = bmesh.new()
    bm.from_mesh(source)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep(v.co) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # Keep the largest connected piece only: stray islands at a region's edge read as specks.
    islands, seen = [], set()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.edges:
                for n in e.link_faces:
                    if n.index not in seen:
                        seen.add(n.index)
                        stack.append(n)
        islands.append(island)
    if not islands:
        bm.free()
        raise ValueError(f'outfit piece {name} selected nothing')
    # A seam is a broken line of narrow strips: it keeps every strip of a few faces or more.
    keep_faces = {f for island in islands if len(island) >= 6 for f in island} if every else set(max(islands, key=len))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep_faces], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal*lift
    border = [v for v in bm.verts if v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=border, factor=.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['thick'], obj['rim'] = thick, rim
    if colour is None:
        obj['glow'] = 1
    else:
        obj['colour'] = colour
    return obj


def module(name):
    """The flight module between the shoulder blades: a bone-white shell over a graphite core, two graphite thruster pods along its
    sides with glowing vents, a line of light down its spine and two short swept fins."""
    bm = bmesh.new()
    def block(centre, size, rot=Matrix.Identity(3), mat=0, colour=BONE):
        geom = bmesh.ops.create_cube(bm, size=1)['verts']
        bmesh.ops.transform(bm, matrix=Matrix.Translation(centre) @ rot.to_4x4() @ Matrix.Diagonal((*size, 1)), verts=geom)
        for f in {f for v in geom for f in v.link_faces}:
            f.material_index, f[tone] = mat, (1 if colour is BONE else 0)
    def pod(x):
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.026, radius2=.022, depth=.25)['verts']
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((x, .17, 1.26))), verts=geom)
        for f in {f for v in geom for f in v.link_faces}:
            f[tone] = 0
            if f.normal.z < -.9:
                f.material_index = 1
    tone = bm.faces.layers.int.new('tone')
    block(Vector((0, .142, 1.29)), (.15, .05, .29))
    block(Vector((0, .169, 1.29)), (.008, .006, .25), mat=1)
    for s in (-1, 1):
        pod(s*.088)
        block(Vector((s*.06, .168, 1.43)), (.016, .045, .12), Matrix.Rotation(radians(-26*s), 3, 'Y') @ Matrix.Rotation(radians(-16), 3, 'X'))
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if all(f[tone] for f in e.link_faces)], offset=.006, segments=2, affect='EDGES')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['thick'], obj['rim'], obj['colour'] = 0, False, BONE
    return obj


def boot(suit, skin, s):
    """A sealed boot: the convex hull of one bare foot and the undersuit's ankle below z .215, lifted 6 mm and softened, graphite, with
    a line of light round the sole."""
    bm = bmesh.new()
    points = [v.co.copy() for v in skin.vertices if v.co.x*s > .05 and v.co.z < .135]
    points += [v.co.copy() for v in suit.vertices if v.co.x*s > .05 and v.co.z < .215]
    for p in points[::3]:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts[:], use_existing_faces=False)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > .03], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal*.006
    # Round the hull's long flat facets (from the front they read as flippers), then lift again what the smoothing pulled in, so no
    # toe of the bare foot inside shows through.
    for _ in range(8):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v.co.z > .02], factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal*.007
    bm.normal_update()
    for f in bm.faces:
        if all(v.co.z < .028 for v in f.verts) and abs(f.normal.z) < .7:
            f.material_index = 1
    mesh = bpy.data.meshes.new(f'boot {s}')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f'boot {s}', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['thick'], obj['rim'], obj['colour'] = 0, False, GRAPHITE
    return obj


def relax(obj, iterations, factor=.5):
    """Smooths a whole piece (the helmet: no ears, nose or lips pressed into the shell)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()


