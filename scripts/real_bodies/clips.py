"""The clips each body carries, under the names the game reads (docs/plans/2026-11-16-real-fight.md B5), and the cut marks measured
from them (B6): for each cut, `impact` (the sword hand's speed peak) and `raised` (its slowest frame before the peak: the top of
the wind-up). Both are measured in the game rig from the sampled clip itself, the way tests/cut-clips.test.ts recomputes them from
the GLB with three.js: forward kinematics of the identity-rest 21-bone skeleton, hand_r's head, central differences per frame.
Plain Python apart from mathutils, so it runs inside Blender with the build.
"""
from mathutils import Quaternion, Vector
from assemble import NAMES, PARENTS

# Game name: (library, source clip). Library: ual1 / ual2 (scripts/angel_asset/packs.py).
ARCHANGEL = {'idle': ('ual1', 'Idle_Loop'), 'swordIdle': ('ual1', 'Sword_Idle'), 'rebuke': ('ual1', 'Spell_Simple_Shoot'),
             'cast': ('ual2', 'OverhandThrow'),
             'cut0': ('ual2', 'Sword_Regular_A'), 'cut0Rec': ('ual2', 'Sword_Regular_A_Rec'),
             'cut1': ('ual2', 'Sword_Regular_B'), 'cut1Rec': ('ual2', 'Sword_Regular_B_Rec'),
             'cut2': ('ual2', 'Sword_Regular_C')}
WATCHER = {'idle': ('ual1', 'Idle_Loop'), 'flight': ('ual2', 'NinjaJump_Idle_Loop'), 'charge': ('ual1', 'Spell_Simple_Shoot'),
           'hit': ('ual1', 'Hit_Chest'), 'down': ('ual1', 'Death01'), 'hitHead': ('ual1', 'Hit_Head'),
           'knock': ('ual2', 'Hit_Knockback'), 'block': ('ual2', 'Sword_Block'), 'rush': ('ual2', 'Sword_Dash_RM'),
           'swordIdle': ('ual1', 'Sword_Idle'), 'cut0': ('ual2', 'Sword_Regular_A'), 'cut1': ('ual2', 'Sword_Regular_B'),
           'cut2': ('ual2', 'Sword_Regular_C')}
CLIPS = {'archangel': ARCHANGEL, 'watcher': WATCHER}
CUTS = ('cut0', 'cut1', 'cut2')
# Sword_Regular_C has no _Rec clip in the library: it carries its own recovery. It is cut at the sword hand's first slowest frame
# after the impact, like A and B end shortly after theirs; the archangel keeps the rest as cut2Rec, the Watcher drops it.
SPLIT, KEEP_TAIL = 'cut2', ('archangel',)
HAND = NAMES.index('hand_r')


def heads(skeleton):
    """Bone heads of the exported skeleton in three.js axes (Blender (x, y, z) -> (x, z, -y)), in NAMES order."""
    mw = skeleton.matrix_world
    out = []
    for name in NAMES:
        h = mw @ skeleton.data.bones[name].head_local
        out.append(Vector((h.x, h.z, -h.y)))
    return out


def hand_path(clip, rest):
    """hand_r's head at each sampled frame: identity-rest bones, local rotations from the clip, the pelvis moved by its offset."""
    path = []
    for rotations, hip in zip(clip['rotations'], clip['pelvis']):
        world, at = [None] * len(NAMES), [None] * len(NAMES)

        def solve(i):
            if world[i] is not None:
                return
            x, y, z, w = rotations[i]
            local, p = Quaternion((w, x, y, z)), PARENTS[i]
            if p < 0:
                world[i], at[i] = local, rest[i] + Vector(hip)
                return
            solve(p)
            world[i] = world[p] @ local
            at[i] = at[p] + world[p] @ (rest[i] - rest[p])
        for i in range(len(NAMES)):
            solve(i)
        path.append(at[HAND])
    return path


def split(clip, rest):
    """(head, tail, frame): the clip cut at the first local minimum of the hand's speed after its peak; the tail starts at 0 s."""
    s = marks(clip, rest)['speeds']
    k = s.index(max(s))
    while k + 2 < len(s) and s[k + 1] < s[k]:
        k += 1
    head = {key: clip[key][:k + 1] for key in ('times', 'rotations', 'pelvis')}
    tail = {'times': [t - clip['times'][k] for t in clip['times'][k:]], 'rotations': clip['rotations'][k:], 'pelvis': clip['pelvis'][k:]}
    return head, tail, k


def marks(clip, rest):
    """{'impact', 'raised'} in seconds, and the speed per frame (m/s, central differences; 0 at the two ends)."""
    t, p = clip['times'], hand_path(clip, rest)
    speed = [0.0] + [(p[k + 1] - p[k - 1]).length / (t[k + 1] - t[k - 1]) for k in range(1, len(p) - 1)] + [0.0]
    peak = max(range(len(speed)), key=lambda k: speed[k])
    raised = min(range(1, peak), key=lambda k: speed[k]) if peak > 1 else 0
    return {'raised': round(t[raised], 4), 'impact': round(t[peak], 4), 'peak_speed': round(speed[peak], 3),
            'speeds': [round(s, 3) for s in speed]}
