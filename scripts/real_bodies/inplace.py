"""Keep each retargeted clip in place: the Universal Animation Library sword clips walk the pelvis forward (up to 4.5 m).
Horizontally (x, z) the first-to-last-frame drift is removed as a straight line, the start offset is zeroed, and what is left
(the sway of the move) is scaled down only if it swings more than `bob` metres. The height (y) is left as the source by default,
because it is what keeps the feet on the ground through a crouch, a rise or a fall; vertical=True treats it like the horizontal
axes but keeps its start offset (the feet then lift or sink by up to the drift removed). Pelvis rotations are untouched.
Axes are three.js: x right, y up, z back (the model faces -Z).
"""


def in_place(clip, bob=.10, vertical=False):
    p = clip['pelvis']
    n = len(p)
    out = [list(r) for r in p]
    report = {}
    for axis, name in enumerate('xyz'):
        if name == 'y' and not vertical:
            continue
        drift = p[-1][axis] - p[0][axis]
        start = p[0][axis] if name == 'y' else 0.0
        values = [(p[k][axis] - p[0][axis]) - drift * k / max(1, n - 1) for k in range(n)]
        peak = max(abs(v) for v in values)
        scale = min(1.0, bob / peak) if peak > 0 else 1.0
        for k in range(n):
            out[k][axis] = start + values[k] * scale
        span = [min(r[axis] for r in p), max(r[axis] for r in p)]
        report[name] = {'source_range_m': [round(s, 3) for s in span], 'drift_removed_m': round(drift, 3),
                        'scaled_by': round(scale, 3), 'kept_range_m': [round(min(o[axis] for o in out), 3),
                                                                        round(max(o[axis] for o in out), 3)],
                        # how far the body moved from where the source put it (vertical: feet lifted (+) or sunk (-))
                        'max_shift_m': round(max((o[axis] - r[axis] for o, r in zip(out, p)), key=abs), 3)}
    clip['pelvis'] = out
    return report
