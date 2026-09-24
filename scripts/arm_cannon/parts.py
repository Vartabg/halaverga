"""Arm cannon geometry in the contract frame (three.js axes, metres), as plain numpy pieces.

A piece is {'v': (N,3), 'f': [vertex index tuples], 'p': [palette slot per face], 'bevel': (width, segments) | None}.
Stations s run along BARREL_AXIS from AXIS_ORIGIN; angle 0 = outer (+U), -90 deg = top (-RADIAL_Z), +90 deg = underside.
Bold r5 (owner feedback "too small on my phone"): cuff .16 x .17, housing .20 x .19 with pod and fins, barrel .13, muzzle .155."""
import numpy as np
from fit import A, O, SECTORS, S0, DS, rim_station, radial
from palette import slot

WALL, CLEAR, SEAM = .008, .007, .0015
MUZZLE_DROP = .012    # steel muzzle ring centre toward the underside (m); see barrel()
# Floor semi-axes (outer, inner, top, underside, exponent): the wall grows outward only, over the unchanged inner fit (hull + CLEAR).
CUFF, HOUSING = (.075, .085, .068, .102, 2.), (.085, .090, .058, .100, 2.4)
POD = {'theta': np.radians(-90), 'top': .092, 'base': .052, 'rear': .205, 'rake': np.radians(62), 'front': np.radians(50), 'len': .09,
       'wt': .040, 'flank': .020, 'foot': (.034, .052), 'hatch': (.006, .07, .05, .006), 'lens': (.90, .78, .004)}
THETA = np.arange(SECTORS)*2*np.pi/SECTORS


class Piece:
    def __init__(self, bevel=None):
        self.v, self.f, self.p, self.b, self.bevel = [], [], [], [], bevel

    def add(self, pts):
        self.v.extend(np.atleast_2d(pts))
        return list(range(len(self.v) - len(np.atleast_2d(pts)), len(self.v)))

    def face(self, idx, part, bev=1):
        self.f.append(tuple(idx)), self.p.append(slot(part)), self.b.append(bev)

    def rows(self, rows, parts, closed=True, bev=1):
        """Quads between consecutive rings; parts[k] colours the band after ring k."""
        ids, n = [self.add(r) for r in rows], len(rows[0])
        for k in range(len(rows) - 1):
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                self.face((ids[k][i], ids[k][j], ids[k+1][j], ids[k+1][i]), parts[k], bev)
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


def floor(o, i, t, u, p):
    """Superellipse radius per sector with its own semi-axis in each half (outer/inner, top/underside)."""
    a, b = np.where(np.cos(THETA) >= 0, o, i), np.where(np.sin(THETA) >= 0, u, t)
    return (np.abs(np.cos(THETA)/a)**p + np.abs(np.sin(THETA)/b)**p)**(-1/p)


def envelope(h):
    """Outer and inner shell radius (sectors x stations). Inner: convex hull + clearance. Outer: inner + wall, non-increasing toward
    the muzzle (except under the pod), then at least the cuff floor, blending by s .16-.22 into the housing floor."""
    st = S0 + DS*np.arange(h.shape[1])
    ei = np.stack([convex_radius(h[:, k]) for k in range(h.shape[1])], 1) + CLEAR
    eo = ei + WALL
    eo[:, st > .29] = eo[:, [np.argmin(np.abs(st - .29))]]
    pod = np.abs(np.angle(np.exp(1j*(THETA - POD['theta'])))) < np.radians(38)
    for k in range(len(st) - 2, -1, -1):
        eo[:, k] = np.where(pod & (st[k] > .195), eo[:, k], np.maximum(eo[:, k], eo[:, k+1]))
    t = np.clip((st - .16)/.06, 0, 1)
    t = t*t*(3 - 2*t)
    eo = np.maximum(eo, floor(*CUFF)[:, None]*(1 - t) + floor(*HOUSING)[:, None]*t)
    return (lambda s, i: float(np.interp(s, st, eo[i]))), (lambda s, i: float(np.interp(s, st, ei[i])))


def ring(s, r, theta=THETA):
    s, r = np.broadcast_to(s, theta.shape), np.broadcast_to(r, theta.shape)
    return np.array([O + si*A + ri*radial(t) for si, ri, t in zip(s, r, theta)])


def shell_lathe(env):
    eo, ei = env
    rim = np.array([rim_station(np.sin(t)) for t in THETA])
    grid = lambda f: lambda s: np.array([f(si, i) for i, si in enumerate(np.broadcast_to(s, THETA.shape))])
    E, Ei = grid(eo), grid(ei)
    inner = [(s, Ei(s)) for s in (.30, .29, .28, .26, .24, .22, .18)] + [(rim + .012, Ei(rim + .012))]
    gasket = Ei(rim) - CLEAR + .0025          # dark seal 2.5 mm off the sleeve hull, only in the first 4 mm of the rim
    face = np.maximum(E(rim + .0015) - .006, Ei(rim) + .0055)   # the rim face (lighter shell) between two steel chamfers
    lip = [(rim + .004, gasket, 'panel'), (rim, gasket, 'panel'), (rim, Ei(rim), 'steel'), (rim, Ei(rim) + .003, 'steel'),
           (rim + .0015, Ei(rim) + .0045, 'shell'), (rim + .0015, face, 'steel'), (rim + .008, E(rim + .008) - .0005, 'steel'),
           (rim + .0095, E(rim + .0095), 'shell')]
    seam = lambda a: [(a, E(a), 'panel'), (a + .001, E(a) - SEAM, 'panel'), (a + .005, E(a + .005) - SEAM, 'panel'), (a + .006, E(a + .006), 'shell')]
    outer = (seam(rim + .021) + [(.18, E(.18), 'green'), (.20, E(.20), 'shell')] + seam(.2215)
             + [(.25, E(.25), 'shell'), (.29, E(.29), 'shell'), (.32, E(.32), 'shell'), (.342, E(.342), 'shell'),
                (.3465, E(.3465) - .002, 'shell'), (.35, E(.35) - .008, 'panel'), (.35, np.full(SECTORS, .052), 'panel')])
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
    """Core (its .435-.462 collar glows with the ring, mask B), two rails, a stepped steel muzzle ring (OD .155) with an emissive
    lip (OD .115 / ID .095) around a dark bore (.075, 38 mm deep). The steel ring's centre sits MUZZLE_DROP below the axis (a heavier
    chin, 3 mm of steel face over the lip on top) while the lip and bore stay on the axis: in portrait ADS the ring's top edge sat
    2 px under the screen's centre third, so the kick lifted it in (bolder visual review r1)."""
    pc = Piece()
    tube(pc, 20, [(.345, .050), (.435, .050), (.462, .050)], ['panel', 'coil'], np.pi/20)
    for t in (np.radians(-45), np.radians(-135)):
        n = radial(t)
        pc.box(O + .40*A + .052*n, np.array([A, np.cross(A, n), n]), (.055, .0025, .0025), 'steel')
    mz = [(.46, .051), (.46, .0725), (.4625, .0775), (.4975, .0775), (.50, .0725), (.50, .0575), (.50, .0475), (.50, .0375)]
    th, drop = np.pi/20 + np.arange(20)*2*np.pi/20, MUZZLE_DROP*radial(np.pi/2)
    pc.rows([ring(si, r, th) + (drop if 1 <= k <= 4 else 0) for k, (si, r) in enumerate(mz)], ['steel']*5 + ['lip', 'panel'])
    bore = Piece()
    ids = tube(bore, 10, [(.4998, .0375), (.462, .0375)], ['bore'], np.pi/10)
    c = bore.add(O + .462*A)[0]
    [bore.face((ids[1][(i + 1) % 10], ids[1][i], c), 'bore') for i in range(10)]
    return [pc, bore]


def fins(eo, th=np.radians(-6)):
    """Heat-sink stack on the outer flank: four plates (two copper fins that glow when hot, framed by graphite vanes) rooted 4 mm
    inside the wall and a graphite spine, reaching .110 m on the outer side, so the rear outline gains a stepped block."""
    pc, n = Piece(), radial(th)
    frame = np.array([A, np.cross(A, n), n])
    k = int(round(th/(2*np.pi/SECTORS))) % SECTORS
    root = min(eo(s, k) for s in (.245, .305)) - .004
    top = (.110 - .021*abs(np.sin(th)))/np.cos(th) - root
    for s, part, h in ((.245, 'panel', top), (.265, 'finglow', top - .004), (.285, 'finglow', top - .004), (.305, 'panel', top)):
        pc.box(O + s*A + (root + h/2)*n, frame, (.0025, .021, h/2), part)
    pc.box(O + .275*A + (root + top - .003)*n, frame, (.034, .0075, .003), 'panel')
    return pc


def slide():
    """Shroud over s .362-.44 (diameter .128) with two glowing coil bands (mask B), in its own frame: origin at its rest centre
    (AXIS_ORIGIN + .40 A)."""
    pc = Piece()
    rows = [(.362, .055), (.362, .059), (.365, .064), (.374, .064), (.383, .064), (.419, .064), (.428, .064), (.437, .064), (.44, .059),
            (.44, .055), (.362, .055)]
    tube(pc, 20, rows, ['panel', 'shell', 'shell', 'coil', 'shell', 'coil', 'shell', 'shell', 'panel', 'panel'], np.pi/20)
    pc.v = [v - (O + .40*A) for v in pc.v]
    return pc
