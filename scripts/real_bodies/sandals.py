"""Plain sandals made from each body's own feet (source frame: Z up, faces -Y, left is +X), in place of the CC-BY shoes02 pack, so
every shipped asset is CC0 or made here: a flat sole under each foot and three straps (two across the foot, one round the
ankle). They are body-surface shells (shells.py), held just off the skin and weighted from the skin under them, the way the
Watcher's bracers and greaves are made, and they use the chiton palette's sandal swatch (no material of their own).
"""
import bpy
import materials
from shells import decimate_inside, dominant, head, shell

SOLE = .008  # sole thickness under the lowest skin of the foot (m)
RIM = .022   # how far up the side of the foot the sole reaches (m)
# Straps across the foot, as fractions of its length from the heel (0) to the toe tip (1): over the instep and over the toes' root.
STRAPS = ((.40, .52), (.66, .76))
ANKLE = (-.004, .026)  # the ankle strap, metres below and above the foot bone's head
TRIANGLES = 1000


def _flat(low):
    def flat(bm):
        for v in bm.verts:
            if v.co.z < low + RIM * .6:
                v.co.z = low - SOLE
    return flat


def dress(rig, pieces, chiton):
    """Add pieces['sandals'] (both feet, one object). Returns the triangle counts."""
    body = pieces['body']
    dom = dominant(body)
    parts = []
    for s in 'lr':
        foot = {f'foot_{s}', f'ball_{s}'}
        low = min(v.co.z for v, d in zip(body.data.vertices, dom) if d in foot)
        parts.append(shell(body, f'sole {s}', lambda co, d, foot=foot, low=low: d in foot and co.z < low + RIM, .004, smooth=4,
                           flare=_flat(low), edge_smooth=3))
        ys = [v.co.y for v, d in zip(body.data.vertices, dom) if d in foot]
        heel, toe = max(ys), min(ys)  # the character faces -Y
        for a, b in STRAPS:
            keep = lambda co, d, foot=foot, a=a, b=b, low=low, heel=heel, toe=toe: \
                d in foot and a < (heel - co.y) / (heel - toe) < b and co.z > low + .012
            parts.append(shell(body, f'strap {s}', keep, .005, smooth=3, edge_smooth=3))
        ankle, near = head(rig, f'foot_{s}').z, foot | {f'calf_{s}'}
        parts.append(shell(body, f'ankle strap {s}', lambda co, d, near=near, ankle=ankle: d in near and
                           ankle + ANKLE[0] < co.z < ankle + ANKLE[1], .005, smooth=3, edge_smooth=3))
    report = {'shells': {p.name: sum(len(f.vertices) - 2 for f in p.data.polygons) for p in parts}}
    parts = [p for p in parts if len(p.data.polygons)]
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    sandals = bpy.context.object
    sandals.name = 'sandals'
    decimate_inside(sandals, TRIANGLES)
    materials.swatch(sandals, 'sandal')
    materials.assign(sandals, chiton)
    pieces['sandals'] = sandals
    report['triangles'] = sum(len(f.vertices) - 2 for f in sandals.data.polygons)
    return report
