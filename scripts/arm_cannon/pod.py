"""Core pod of the arm cannon (split from parts.py to keep modules under 200 lines): contract frame, metres, as a parts.Piece."""
import numpy as np
from fit import A, O, radial
from parts import POD, Piece


def pod():
    """Core pod on the housing top: a rear face raked 62 deg (normal within 20 deg of the chase view) carrying the recessed hexagonal
    core lens (mask R) in a glowing bezel (mask B), heat strips on the top flanks, a cavity with five fins under the vent hatch, and a
    raked front. Returns the pod, the hatch in its hinge frame, the hatch frame (origin, 3x3 rows X, Y, Z), lens centre, vent mouth."""
    P = POD
    N = radial(P['theta'])
    T = np.cross(A, N)
    pt = lambda s, t, n: O + s*A + t*T + n*N
    nt, wt, fl, rk, (ft, fn) = P['top'], P['wt'], P['flank'], P['rake'], P['foot']
    hexa = [(-ft, fn), (-(wt + fl), nt - fl), (-wt, nt), (wt, nt), (wt + fl, nt - fl), (ft, fn)]
    r1 = P['rear'] + (nt - P['base'])/np.tan(rk) + .0015
    at_s = [lambda n: P['rear'] + (n - P['base'])/np.tan(rk), lambda n: r1, lambda n: r1 + P['len'],
            lambda n: r1 + P['len'] + (nt - n)/np.tan(P['front'])]
    pc = Piece((.0025, 2))
    R = [pc.add([pt(f(n), t, n) for t, n in hexa]) for f in at_s]
    for k in range(3):
        for i in range(6):
            if not (k == 1 and i == 2):
                j = (i + 1) % 6
                pc.face((R[k][i], R[k][j], R[k+1][j], R[k+1][i]), 'strip' if k == 1 and i in (1, 3) else 'shell')
    pc.face(R[3][::-1], 'panel')
    # Rear face: frame (panel), glowing bezel (coil, mask B), recess walls (panel), lens (mask R): insets of the hexagon about c,
    # a point a little above the face centre, because the cuff hides the lowest few millimetres from behind.
    k0, k1, ld = P['lens']
    nrm = -np.sin(rk)*A + np.cos(rk)*N
    nc = .5*(fn + nt) + .003
    c = pt(at_s[0](nc), 0, nc)
    rim0 = [pc.v[i] for i in R[0]]
    B0 = pc.add([c + k0*(p - c) for p in rim0])
    B1 = pc.add([c + k1*(p - c) for p in rim0])
    F = pc.add([pc.v[i] - ld*nrm for i in B1])
    for i in range(6):
        j = (i + 1) % 6
        pc.face((R[0][j], R[0][i], B0[i], B0[j]), 'panel')
        pc.face((B0[j], B0[i], B1[i], B1[j]), 'coil', 0)
        pc.face((B1[j], B1[i], F[i], F[j]), 'panel', 0)
    pc.face(F[::-1], 'lens', 0)
    h0, hl, hw, hd = P['hatch'][0] + r1, *P['hatch'][1:]
    o = pc.add([pt(s, t, nt) for s, t in [(h0 - .001, -hw/2 - .001), (h0 - .001, hw/2 + .001), (h0 + hl + .001, hw/2 + .001),
                                          (h0 + hl + .001, -hw/2 - .001)]])
    a, b, c2, d = R[1][2], R[1][3], R[2][3], R[2][2]
    for q in [(a, b, o[1], o[0]), (b, c2, o[2], o[1]), (c2, d, o[3], o[2]), (d, a, o[0], o[3])]:
        pc.face(q, 'shell')
    f = pc.add([pc.v[i] - .02*N for i in o])
    for i in range(4):
        pc.face((o[i], o[(i + 1) % 4], f[(i + 1) % 4], f[i]), 'panel', 0)
    pc.face(f, 'strip', 0)          # cavity floor: glows with the strips, seen only with the hatch open
    for k in range(5):
        pc.box(pt(h0 + .009 + k*.013, 0, nt - .0145), np.array([A, T, N]), (.002, .022, .0055), 'finglow')
    hatch = Piece((.002, 2))
    hatch.box(np.array([0, -hd/2, -hl/2]), np.eye(3), (hw/2, hd/2, hl/2), 'shell')
    # Hinged on the muzzle-side edge (local Z = A), so the lid swings away from the chase camera (review r2). Mouth 35% along it.
    frame = (pt(h0 + hl, 0, nt), np.array([np.cross(N, A), N, A]))
    lens = np.mean([pc.v[i] for i in F], 0)
    return pc, hatch, frame, lens, pt(h0 + .35*hl, 0, nt + .004)
