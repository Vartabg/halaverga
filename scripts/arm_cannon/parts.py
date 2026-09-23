"""Arm cannon geometry in the contract frame (three.js axes, metres), as plain numpy pieces.

A piece is {'v': (N,3), 'f': [vertex index tuples], 'p': [palette slot per face], 'bevel': (width, segments) | None}.
Stations s run along BARREL_AXIS from AXIS_ORIGIN; angle 0 = outer (+U), -90 deg = top (-RADIAL_Z), +90 deg = underside."""
import numpy as np
from fit import A, O, SECTORS, S0, DS, rim_station, radial
from palette import slot

WALL, CLEAR, SEAM = .008, .007, .0015
POD = {'theta': np.radians(-90), 'top': .082, 'base': .0565, 'rear': .199, 'rake': np.radians(35), 'front': np.radians(50),
       'wt': .028, 'flank': .017, 'hatch': (.0045, .07, .045, .006), 'lens': (.04, .025, .003)}
THETA = np.arange(SECTORS)*2*np.pi/SECTORS


class Piece:
    def __init__(self, bevel=None):
        self.v, self.f, self.p, self.b, self.bevel = [], [], [], [], bevel

    def add(self, pts):
        self.v.extend(np.atleast_2d(pts))
        return list(range(len(self.v) - len(np.atleast_2d(pts)), len(self.v)))

    def face(self, idx, part, bev=1):
        self.f.append(tuple(idx)), self.p.append(slot(part)), self.b.append(bev)

    def rows(self, rows, parts, closed=True):
        """Quads between consecutive rings; parts[k] colours the band after ring k."""
        ids, n = [self.add(r) for r in rows], len(rows[0])
        for k in range(len(rows) - 1):
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                self.face((ids[k][i], ids[k][j], ids[k+1][j], ids[k+1][i]), parts[k])
        return ids

    def box(self, c, axes, half, part):
        """Oriented box: centre c, unit axes (3,3) rows, half extents."""
        corners = [c + sum(sg*h*a for sg, h, a in zip(signs, half, axes))
                   for signs in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        i = self.add(corners)
        for q in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]:
            self.face([i[k] for k in q], part)


def convex_radius(r):
    """Radius, along each sector direction, of the convex hull of the sector points (r_i at THETA_i)."""
    pts = np.stack([r*np.cos(THETA), r*np.sin(THETA)], 1)
    order = sorted(range(len(pts)), key=lambda k: (pts[k][0], pts[k][1]))
    hull = []
    for seq in [order, order[::-1]]:
        part = []
        for k in seq:
            while len(part) > 1 and np.cross(pts[part[-1]] - pts[part[-2]], pts[k] - pts[part[-2]]) <= 0:
                part.pop()
            part.append(k)
        hull += part[:-1]
    out = np.full(len(r), np.inf)
    for a, b in zip(hull, hull[1:] + hull[:1]):
        e = pts[b] - pts[a]
        m = np.array([e[1], -e[0]])/np.linalg.norm(e)
        c = m @ pts[a]
        if c < 0:
            m, c = -m, -c
        d = np.stack([np.cos(THETA), np.sin(THETA)], 1) @ m
        out = np.minimum(out, np.where(d > 1e-9, c/np.maximum(d, 1e-9), np.inf))
    return out


def envelope(h):
    """Outer shell radius grid (sectors x stations): convex hull + clearance + wall, a housing floor ellipse,
    then non-increasing toward the muzzle so the cuff tapers cleanly into the housing."""
    st = S0 + DS*np.arange(h.shape[1])
    under = np.sin(THETA) > 0
    floor = 1/np.sqrt((np.cos(THETA)/.046)**2 + (np.sin(THETA)/np.where(under, .060, .055))**2)
    eo = np.stack([convex_radius(h[:, k]) for k in range(h.shape[1])], 1) + CLEAR + WALL
    eo[:, st > .215] = np.maximum(eo[:, st > .215], floor[:, None])
    eo[:, st > .29] = eo[:, [np.argmin(np.abs(st - .29))]]
    pod = np.abs(np.angle(np.exp(1j*(THETA - POD['theta'])))) < np.radians(38)   # hidden under the pod past s .195
    for k in range(len(st) - 2, -1, -1):
        eo[:, k] = np.where(pod & (st[k] > .195), eo[:, k], np.maximum(eo[:, k], eo[:, k+1]))
    return lambda s, i: float(np.interp(s, st, eo[i]))


def ring(s, r, theta=THETA):
    s, r = np.broadcast_to(s, theta.shape), np.broadcast_to(r, theta.shape)
    return np.array([O + si*A + ri*radial(t) for si, ri, t in zip(s, r, theta)])


def shell_lathe(eo):
    rim = np.array([rim_station(np.sin(t)) for t in THETA])
    E = lambda s: np.array([eo(si, i) for i, si in enumerate(np.broadcast_to(s, THETA.shape))])
    Ei = lambda s: E(s) - WALL
    inner = [(s, Ei(s)) for s in (.30, .29, .28, .26, .24, .22, .18)] + [(rim + .012, Ei(rim + .012))]
    gasket = Ei(rim) - CLEAR + .0025          # dark seal 2.5 mm off the sleeve hull, only in the first 4 mm of the rim
    lip = [(rim + .004, gasket, 'panel'), (rim, gasket, 'panel'), (rim, Ei(rim), 'steel'), (rim, Ei(rim) + .003, 'steel'),
           (rim + .0015, Ei(rim) + .0045, 'steel'), (rim + .012, E(rim + .012) - .0005, 'steel'), (rim + .0135, E(rim + .0135), 'shell')]
    seam = lambda a: [(a, E(a), 'panel'), (a + .001, E(a) - SEAM, 'panel'), (a + .005, E(a + .005) - SEAM, 'panel'), (a + .006, E(a + .006), 'shell')]
    outer = (seam(rim + .021) + [(.18, E(.18), 'green'), (.20, E(.20), 'shell')] + seam(.2215)
             + [(.25, E(.25), 'shell'), (.28, E(.28), 'shell'), (.298, E(.298), 'shell'), (.3035, E(.3035) - .0015, 'shell'),
                (.306, E(.306) - .005, 'panel'), (.306, np.full(SECTORS, .033), 'panel')])
    rows = [ring(s, r) for s, r in inner] + [ring(s, r) for s, r, _ in lip + outer]
    parts = ['inner']*len(inner) + [p for _, _, p in lip + outer]
    pc = Piece()
    pc.rows(rows, parts)
    centre = pc.add(O + .30*A)[0]
    [pc.face((centre, i, (i + 1) % SECTORS), 'inner') for i in range(SECTORS)]
    return pc


def tube(pc, seg, rows, parts, phase=0.):
    th = phase + np.arange(seg)*2*np.pi/seg
    return pc.rows([ring(s, r, th) for s, r in rows], parts)


def barrel():
    """Slim core (its .40-.44 collar glows with the ring, mask B, and reads side-on), two rails, flared muzzle ring."""
    pc = Piece()
    tube(pc, 16, [(.300, .027), (.40, .027), (.445, .027)], ['panel', 'coil'], np.pi/16)
    for t in (np.radians(-45), np.radians(-135)):
        n = radial(t)
        pc.box(O + .375*A + .0285*n, np.array([A, np.cross(A, n), n]), (.063, .002, .002), 'steel')
    mz = [(.44, .028), (.44, .046), (.4425, .050), (.4575, .050), (.46, .046), (.46, .025), (.46, .021)]
    tube(pc, 16, mz, ['steel']*5 + ['lip'], np.pi/16)
    bore = Piece()
    ids = tube(bore, 8, [(.4598, .0215), (.42, .0215)], ['bore'], np.pi/8)
    c = bore.add(O + .42*A)[0]
    [bore.face((ids[1][(i + 1) % 8], ids[1][i], c), 'bore') for i in range(8)]
    return [pc, bore]


def fins(eo, th=np.radians(-6)):
    """Heat-sink stack on the outer flank (review r3: from behind the cannon read as a plain round cuff about 11 px wide at chase
    portrait). Four plates stand 52-56 mm proud of the housing, rooted 4 mm inside the wall: two copper fins (they glow with the
    strips when hot) framed by two graphite vanes, capped by a graphite spine, so the rear outline gains a stepped block on the outer
    side next to the raised pod on top."""
    pc, n = Piece(), radial(th)
    frame = np.array([A, np.cross(A, n), n])
    k = int(round(th/(2*np.pi/SECTORS))) % SECTORS
    root = min(eo(s, k) for s in (.226, .286)) - .004
    for s, part, h in ((.226, 'panel', .060), (.246, 'finglow', .056), (.266, 'finglow', .056), (.286, 'panel', .060)):
        pc.box(O + s*A + (root + h/2)*n, frame, (.002, .016, h/2), part)
    pc.box(O + .256*A + (root + .057)*n, frame, (.032, .006, .003), 'panel')
    return pc


def slide():
    """Shroud over s .34-.42 with two glowing coil bands (mask B), in its own frame: origin at its rest centre (AXIS_ORIGIN + .38 A)."""
    pc = Piece()
    rows = [(.34, .0315), (.34, .0345), (.3425, .0375), (.352, .0375), (.358, .0375), (.402, .0375), (.408, .0375), (.4175, .0375), (.42, .0345), (.42, .0315), (.34, .0315)]
    tube(pc, 16, rows, ['panel', 'shell', 'shell', 'coil', 'shell', 'coil', 'shell', 'shell', 'panel', 'panel'], np.pi/16)
    pc.v = [v - (O + .38*A) for v in pc.v]
    return pc


def pod():
    """Core pod on the top/outer housing: raked rear face with the recessed lens, heat strips on the top flanks,
    a cavity with five fins under the vent hatch, and a raked front. Returns the pod, the hatch in its hinge frame, the
    hatch frame (origin, 3x3 rows X, Y, Z), the lens centre and the vent mouth."""
    P = POD
    N = radial(P['theta'])
    T = np.cross(A, N)
    pt = lambda s, t, n: O + s*A + t*T + n*N
    nt, wt, fl, rk = P['top'], P['wt'], P['flank'], P['rake']
    hexa = [(-.024, .051), (-(wt + fl), nt - fl), (-wt, nt), (wt, nt), (wt + fl, nt - fl), (.024, .051)]
    r1 = P['rear'] + (nt - P['base'])/np.tan(rk) + .0015
    at_s = [lambda n: P['rear'] + (n - P['base'])/np.tan(rk), lambda n: r1, lambda n: r1 + .08,
            lambda n: r1 + .08 + (nt - n)/np.tan(P['front'])]
    pc = Piece((.0025, 2))
    R = [pc.add([pt(f(n), t, n) for t, n in hexa]) for f in at_s]
    for k in range(3):
        for i in range(6):
            if not (k == 1 and i == 2):
                j = (i + 1) % 6
                pc.face((R[k][i], R[k][j], R[k+1][j], R[k+1][i]), 'strip' if k == 1 and i in (1, 3) else 'shell')
    pc.face(R[3][::-1], 'panel')
    lw, lh, ld = P['lens']
    nrm = -np.sin(rk)*A + np.cos(rk)*N
    up = np.cos(rk)*A + np.sin(rk)*N
    lc = pt(at_s[0](nt - .002 - lh/2*np.sin(rk)), 0, nt - .002 - lh/2*np.sin(rk))
    L = pc.add([lc + a*lw/2*T + b*lh/2*up for a, b in [(-1, -1), (-1, 1), (1, 1), (1, -1)]])
    F = pc.add([pc.v[i] - ld*nrm for i in L])
    r0 = R[0]
    for q in [(r0[0], r0[1], L[1], L[0]), (r0[1], r0[2], L[1]), (r0[2], r0[3], L[2], L[1]), (r0[3], r0[4], L[2]),
              (r0[4], r0[5], L[3], L[2]), (r0[5], r0[0], L[0], L[3])]:
        pc.face(q, 'panel')           # matte rear face: as 'shell' it caught a peach sun highlight in the vent return (review r2)
    for i in range(4):
        pc.face((L[i], L[(i + 1) % 4], F[(i + 1) % 4], F[i]), 'panel', 0)
    pc.face(F, 'lens', 0)
    h0, hl, hw, hd = P['hatch'][0] + r1, *P['hatch'][1:]
    o = pc.add([pt(s, t, nt) for s, t in [(h0 - .001, -hw/2 - .001), (h0 - .001, hw/2 + .001), (h0 + hl + .001, hw/2 + .001),
                                          (h0 + hl + .001, -hw/2 - .001)]])
    a, b, c, d = R[1][2], R[1][3], R[2][3], R[2][2]
    for q in [(a, b, o[1], o[0]), (b, c, o[2], o[1]), (c, d, o[3], o[2]), (d, a, o[0], o[3])]:
        pc.face(q, 'shell')
    f = pc.add([pc.v[i] - .018*N for i in o])
    for i in range(4):
        pc.face((o[i], o[(i + 1) % 4], f[(i + 1) % 4], f[i]), 'panel', 0)
    pc.face(f, 'strip', 0)          # cavity floor: glows with the strips, seen only with the hatch open
    for k in range(5):
        pc.box(pt(h0 + .008 + k*.0135, 0, nt - .013), np.array([A, T, N]), (.002, .018, .005), 'finglow')
    hatch = Piece((.002, 2))
    hatch.box(np.array([0, -hd/2, -hl/2]), np.eye(3), (hw/2, hd/2, hl/2), 'shell')
    # Hinged on the muzzle-side edge (local Z = A), so the lid swings away from the chase camera, which looks up the barrel from
    # the elbow side in the vent pose; the elbow-side hinge hid the cavity behind the lid (review r2). Mouth 35% along the hatch.
    frame = (pt(h0 + hl, 0, nt), np.array([np.cross(N, A), N, A]))
    return pc, hatch, frame, lc - ld*nrm, pt(h0 + .35*hl, 0, nt + .004)
