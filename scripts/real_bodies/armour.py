"""The Watcher's armour, shaped from his own baked body (source frame, Z up, faces -Y) while it still carries MPFB's bone groups:
a bronze cuirass (its own mesh, 'plate', so a broken Watcher loses it), bronze bracers and greaves (body-surface shells from
shells.py, held a set distance off the skin and weighted from the skin under them, so they deform with the rig) and a skirt of
leather pteruges strips weighted from the pelvis onto the thighs, on the chiton palette's leather swatch (one material fewer).
"""
from math import cos, pi, sin
from mathutils import Vector, kdtree
import bmesh
import bpy
import materials
from shells import along as _along, decimate_inside, dominant as _dominant, head as _head, shell

BRONZE = ((.36, .22, .10), 1.0, .4)
PLATE_TRIANGLES, LIMB_TRIANGLES = 850, 550


def pteruges(body, rig, top, length=.30, count=18, rows=3, spread=1.2):
    """A ring of strips hanging from `top` (z), flaring out; weights blend from the pelvis (top) to the nearest skin (bottom)."""
    verts = [v.co for v in body.data.vertices if abs(v.co.z - top) < .02 and abs(v.co.x) < .25]
    cx, cy = 0.0, sum(c.y for c in verts) / len(verts)
    rx = max(abs(c.x) for c in verts) + .035
    ry = max(abs(c.y - cy) for c in verts) + .035
    coords, faces, mix = [], [], []
    half = pi / count * .82
    for k in range(count):
        a = 2 * pi * k / count
        base = len(coords)
        for r in range(rows + 1):
            s = 1 + (spread - 1) * r / rows
            for side in (-1, 1):
                b = a + side * half
                coords.append(Vector((cx + rx * s * cos(b), cy + ry * s * sin(b), top - length * r / rows)))
                mix.append(r / rows)
        faces += [(base + 2 * r, base + 2 * r + 1, base + 2 * r + 3, base + 2 * r + 2) for r in range(rows)]
    mesh = bpy.data.meshes.new('pteruges')
    mesh.from_pydata([tuple(c) for c in coords], [], faces)
    obj = bpy.data.objects.new('pteruges', mesh)
    bpy.context.scene.collection.objects.link(obj)
    kd = kdtree.KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {}
    group = lambda n: groups.setdefault(n, obj.vertex_groups.new(name=n))
    for i, co in enumerate(coords):
        _, j, _ = kd.find(co)
        near = [(names[g.group], g.weight) for g in body.data.vertices[j].groups if g.weight > 0 and names[g.group] in BONES]
        total = sum(w for _, w in near) or 1
        t = mix[i] * .85
        group('pelvis').add([i], 1 - t, 'ADD')
        for n, w in near:
            group(n).add([i], t * w / total, 'ADD')
    return obj


BONES = {'pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}


def trim_under(cloth, z_low, z_high):
    """Drop cloth faces the cuirass covers (torso between z_low and z_high, sleeves kept): less poke-through, fewer triangles."""
    dom = _dominant(cloth)
    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    bm.verts.ensure_lookup_table()
    def covered(v):  # the cuirass also covers the inner ends of the clavicles (its keep test), so does the trim
        d = dom[v.index] or ''
        return z_low < v.co.z < z_high and not (d.startswith(('upperarm', 'lowerarm')) or (d.startswith('clavicle') and abs(v.co.x) > .13))
    gone = [f for f in bm.faces if all(covered(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(cloth.data)
    bm.free()
    return len(gone)


def dress(rig, pieces, chiton):
    """Add 'plate' (the cuirass), 'bronze' (bracers and greaves joined) and 'pteruges' to pieces; trim the chiton under the
    cuirass. chiton: the chiton's palette material, which the pteruges share."""
    body = pieces['body']
    pelvis, neck = _head(rig, 'pelvis'), _head(rig, 'neck_01')
    low, high = pelvis.z + .07, neck.z - .03
    torso = {'spine_01', 'spine_02', 'spine_03', 'pelvis'}
    cuirass_keep = lambda co, d: low < co.z < high and (d in torso or (d and d.startswith('clavicle') and abs(co.x) < .15))

    def flare(bm):
        zmin = min(v.co.z for v in bm.verts)
        for v in bm.verts:
            f = max(0, 1 - (v.co.z - zmin) / .06)
            out = Vector((v.co.x, v.co.y - pelvis.y, 0))
            if f and out.length:
                v.co += out.normalized() * .03 * f

    plate = shell(body, 'plate', cuirass_keep, .03, flare=flare, edge_smooth=8, exclude=('upperarm', 'lowerarm', 'hand'))
    limbs = []
    for s in 'lr':
        limbs.append(shell(body, f'bracer {s}', lambda co, d, s=s: d == f'lowerarm_{s}' and .35 < _along(rig, f'lowerarm_{s}', co) < .93,
                           .012, smooth=10, edge_smooth=6))
        limbs.append(shell(body, f'greave {s}', lambda co, d, s=s: d == f'calf_{s}' and .12 < _along(rig, f'calf_{s}', co) < .86,
                           .022, smooth=10, edge_smooth=6))
    report = {p.name: sum(len(f.vertices) - 2 for f in p.data.polygons) for p in [plate, *limbs]}
    bottom = min(v.co.z for v in plate.data.vertices)
    skirt = pteruges(body, rig, bottom + .01)
    report['pteruges'] = sum(len(f.vertices) - 2 for f in skirt.data.polygons)
    report['chiton_faces_under_cuirass'] = trim_under(pieces['chiton'], bottom + .05, high)
    bpy.ops.object.select_all(action='DESELECT')
    for p in limbs:
        p.select_set(True)
    bpy.context.view_layer.objects.active = limbs[0]
    bpy.ops.object.join()
    bronze = bpy.context.object
    bronze.name = 'bronze'
    decimate_inside(plate, PLATE_TRIANGLES)
    decimate_inside(bronze, LIMB_TRIANGLES)
    metal = materials.flat('watcher bronze', *BRONZE)
    materials.assign(plate, metal)
    materials.assign(bronze, metal)
    materials.swatch(skirt, 'leather')
    materials.assign(skirt, chiton)
    pieces['plate'], pieces['bronze'], pieces['pteruges'] = plate, bronze, skirt
    report['cuirass_bottom_above_pelvis_m'] = round(bottom - pelvis.z, 3)
    return report
