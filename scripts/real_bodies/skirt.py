"""The chiton's outer parts, built procedurally around the baked body (source frame: Z up, faces -Y, left is +X).

Skirt: six panels hanging from the waist to just above the knee (front and back split at the centre, one per side), each
following the convex outline of hips and thighs, lightly pleated, with a trim-coloured hem band. Above the hip joint a panel takes
the torso weights of the nearest skin; below, it blends from the pelvis onto its own thigh with the same weight across the row, so
a panel turns and bends with the leg but never stretches across: in a wide stance the panels part at the slits.
Belt: a leather band with a bronze-colored binding. Faces pick colors by their UVs (materials.palette).
"""
from math import cos, pi, radians, sin
import bpy
import numpy as np
from mathutils import Vector, kdtree
import shells
import materials

LIMBS = ('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb', 'neck', 'head')
TORSO = {'pelvis', 'spine_01', 'spine_02', 'spine_03'}
# name, first and last angle (degrees, 0 = the character's left, -90 = front), thigh, thigh weight at the hem, extra radius
PANELS = [('front_l', -95, -40, 'thigh_l', .7, 0), ('side_l', -45, 45, 'thigh_l', .9, .008), ('back_l', 40, 95, 'thigh_l', .7, 0),
          ('back_r', 85, 140, 'thigh_r', .7, .004), ('side_r', 135, 225, 'thigh_r', .9, .008),
          ('front_r', 220, 275, 'thigh_r', .7, .004)]
CLEAR, FLARE, PLEAT, HEM = .022, .03, .006, .045


class Outline:
    """Support distance of the body's hips and legs (arms left out) from the pelvis axis, per direction and height, never
    shrinking below the waist (cloth hangs from the widest point instead of tucking in toward the knees)."""

    def __init__(self, body, centre, waist, knee):
        dom = shells.dominant(body)
        keep = [i for i, d in enumerate(dom) if d and not d.startswith(LIMBS)]
        co = np.array([body.data.vertices[i].co[:] for i in keep])
        self.xy, self.z, self.c, self.waist, self.knee = co[:, :2] - centre, co[:, 2], np.array(centre), waist, knee

    def support(self, angle, z):
        near = np.abs(self.z - z) < .03
        if not near.any():
            return 0.0
        return float((self.xy[near] @ np.array([cos(angle), sin(angle)])).max())

    def radius(self, angle, z, steps=8):
        """Largest support at this angle from the waist down to z."""
        return max(self.support(angle, self.waist + (z - self.waist) * k / steps) for k in range(steps + 1))


def _torso_weights(body, kd, names, co):
    _, j, _ = kd.find(co)
    w = {names[g.group]: g.weight for g in body.data.vertices[j].groups if names.get(g.group) in TORSO}
    total = sum(w.values())
    return {k: v / total for k, v in w.items()} if total else {'pelvis': 1.0}


def skirt(body, outline, waist, knee, hip, rows=6, step=6.5, hems=None):
    """The six panels as one object; returns it. Rings go from the waist (top) to the hem band and the hem."""
    kd = kdtree.KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    coords, faces, weights, swatches = [], [], [], []
    cloth, trim = ('cloth', 'trim') if hems is None else ('panel_cloth', 'panel_trim')
    for name, a0, a1, thigh, reach, extra in PANELS:
        hem = knee if hems is None else knee + hems[name]
        binding = HEM if hems is None else .031
        heights = [waist + (hem + binding - waist) * r / rows for r in range(rows + 1)] + [hem]
        cols = max(2, round((a1 - a0) / step / 2) * 2)
        base = len(coords)
        for r, z in enumerate(heights):
            down = (waist - z) / (waist - hem)
            for c in range(cols + 1):
                a = radians(a0 + (a1 - a0) * c / cols)
                rad = outline.radius(a, z) + CLEAR + extra + FLARE * down ** 2 + PLEAT * down * (1 if c % 2 else -1)
                co = Vector((outline.c[0] + rad * cos(a), outline.c[1] + rad * sin(a), z))
                coords.append(co)
                t = min(1, max(0, (hip - z) / (hip - knee)))
                w = _torso_weights(body, kd, names, co) if z > hip else {'pelvis': 1 - reach * t, thigh: reach * t}
                weights.append(w)
        for r in range(len(heights) - 1):
            for c in range(cols):
                i = base + r * (cols + 1) + c
                faces.append((i, i + cols + 1, i + cols + 2, i + 1))
                swatches.append(trim if r == len(heights) - 2 else cloth)
    return panel_mesh('skirt', coords, faces, weights, swatches)


def belt(body, outline, waist, width=.071, cols=32):
    kd = kdtree.KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in body.vertex_groups}
    coords, weights, faces = [], [], []
    top, bottom = waist + width / 2, waist - width / 2
    for z in (top, top - .009, bottom + .009, bottom):
        for c in range(cols):
            a = 2 * pi * c / cols
            rad = outline.radius(a, waist) + CLEAR + .012
            co = Vector((outline.c[0] + rad * cos(a), outline.c[1] + rad * sin(a), z))
            coords.append(co)
            weights.append(_torso_weights(body, kd, names, co))
    faces = []
    for r in range(3):
        for c in range(cols):
            nxt = (c + 1) % cols
            faces.append((r * cols + c, (r + 1) * cols + c, (r + 1) * cols + nxt, r * cols + nxt))
    return panel_mesh('belt', coords, faces, weights, ['bronze'] * cols + ['leather'] * cols + ['bronze'] * cols)


def panel_mesh(name, coords, faces, weights, swatches):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(c) for c in coords], [], faces)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for i, w in enumerate(weights):
        for bone, value in w.items():
            if value > 0:
                if bone not in groups:
                    groups[bone] = obj.vertex_groups.new(name=bone)
                groups[bone].add([i], value, 'REPLACE')
    layer = me.uv_layers.new(name='UVMap')
    for poly, swatch in zip(me.polygons, swatches):
        for li in poly.loop_indices:
            layer.data[li].uv = materials.SWATCH[swatch]
    return obj
