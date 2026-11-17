"""A knee-length chiton shaped from the baked body (source frame: Z up, faces -Y, left is +X), in place of a downloaded tunic.

Inner layer: a body-surface shell (shells.shell) over the torso, short sleeves and the hips, with a round neck; it keeps the body's
weights, so it deforms like skin, and the skin under it (but for a few rings at its edge) is deleted. Outer layer: the skirt
panels and the belt (skirt.py). All of it is one piece, 'chiton', with one material (materials.palette).
Also here: trimming hair cards that fall over the eyes, and pushing other garments (the Watcher's pteruges) outside the skirt.
"""
from math import atan2, hypot
import bmesh
import bpy
from mathutils import Vector
import archangel_cloth
import shells
import materials
import skirt

INNER_TRIANGLES = 1800
NECK = .10  # radius of the round neck, around a point just in front of the neck_01 head
SLEEVE, SHORTS = .45, .40  # how far down the upper arm and the thigh the inner layer reaches (0 head, 1 tail)


def _tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def skin_under(body, keep, rings=3):
    """Body vertices the inner layer covers, less `rings` rings at its edge (so no gap shows under the hem of the shell)."""
    dom = shells.dominant(body)
    covered = {v.index for v in body.data.vertices if keep(v.co, dom[v.index])}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    for _ in range(rings):
        covered = {i for i in covered if all(o.index in covered for e in bm.verts[i].link_edges for o in e.verts)}
    bm.free()
    return covered


def hide_skin(body, covered):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in covered], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    return len(covered)


def dress(name, rig, pieces, folder, belt=True):
    """Add pieces['chiton']. Returns (report, context for later steps: the skirt outline and the body vertices to hide)."""
    body = pieces['body']
    head = lambda bone: shells.head(rig, bone)
    pelvis, spine3, neck = head('pelvis'), head('spine_03'), head('neck_01')
    waist = pelvis.z + .4 * (spine3.z - pelvis.z)
    hip, knee = head('thigh_l').z, head('calf_l').z + .04
    hole = neck + Vector((0, -.02, 0))
    hero = name == 'archangel'

    def keep(co, d):
        if not d:
            return False
        if hero and not d.startswith('thigh'):
            return archangel_cloth.covers(rig, neck, co, d)
        if (co - hole).length < NECK:
            return False
        if d in skirt.TORSO or d.startswith('clavicle'):
            return True
        for bone, reach in (('upperarm', SLEEVE), ('thigh', SHORTS)):
            if d.startswith(bone):
                return shells.along(rig, d, co) < reach
        return False

    inner = shells.shell(body, 'chiton inner', keep, .008, smooth=10, edge_smooth=8)
    inner_source = _tris(inner)
    shells.decimate_inside(inner, INNER_TRIANGLES)
    if hero:
        archangel_cloth.bind_edge(inner, neck)
    else:
        materials.swatch(inner, 'cloth')
    outline = skirt.Outline(body, (pelvis.x, pelvis.y), waist, knee)
    hems = archangel_cloth.HEMS if hero else None
    parts = [inner, skirt.skirt(body, outline, waist, knee, hip, hems=hems)]
    if belt:
        parts.append(skirt.belt(body, outline, waist))
    report = {'inner': [inner_source, _tris(inner)], 'skirt': _tris(parts[1]), 'belt': _tris(parts[2]) if belt else 0,
              'waist_above_pelvis_m': round(waist - pelvis.z, 3), 'hem_above_knee_m': .04,
              'skirt_length_m': round(waist - knee, 3)}
    if hero:
        fittings = [archangel_cloth.clasp(inner, neck), archangel_cloth.guard(body, rig)]
        report['fittings'] = {p.name: _tris(p) for p in fittings}
        report['hem_above_knee_m'] = {panel: round(.04 + offset, 3) for panel, offset in hems.items()}
        parts.extend(fittings)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = inner
    bpy.ops.object.join()
    chiton = bpy.context.object
    chiton.name = 'chiton'
    mat, row = materials.palette(name, folder)
    materials.assign(chiton, mat)
    pieces['chiton'] = chiton
    return report, {'outline': outline, 'skin': skin_under(body, keep), 'texture': row}


def clear(obj, outline, margin=.012):
    """Push vertices of obj (the pteruges) radially outside the skirt at their height. Returns how many moved."""
    moved = 0
    span = outline.waist - outline.knee
    for v in obj.data.vertices:
        x, y = v.co.x - outline.c[0], v.co.y - outline.c[1]
        a, r = atan2(y, x), hypot(x, y)
        down = min(1, max(0, (outline.waist - v.co.z) / span))
        need = outline.radius(a, min(v.co.z, outline.waist)) + skirt.CLEAR + .008 + skirt.FLARE * down ** 2 + skirt.PLEAT + margin
        if r < need:
            v.co.x, v.co.y = outline.c[0] + x * need / r, outline.c[1] + y * need / r
            moved += 1
    return moved


def trim_fringe(hair, eyes, above=.02, ahead=.035, across=.09):
    """Delete hair faces hanging in front of the eyes: below the brow line, ahead of a plane just behind the eye fronts."""
    pts = [v.co for v in eyes.data.vertices]
    top, front, cx = max(p.z for p in pts), min(p.y for p in pts), sum(p.x for p in pts) / len(pts)
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    gone = [f for f in bm.faces if (lambda c: c.z < top + above and c.y < front + ahead and abs(c.x - cx) < across)(
        f.calc_center_median())]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(hair.data)
    bm.free()
    return len(gone)
