"""Measure public/models/suit.glb for the arm cannon (R1 rigid forearm hull, blaster weights, linear-blend posing). Numbers come
from src/world/cannonContract.ts. The GLB is read directly in three.js axes (= (x_b, z_b, -y_b) of a Blender import)."""
import json
import re
import struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SUIT, CONTRACT = ROOT/"public/models/suit.glb", ROOT/"src/world/cannonContract.ts"
NAMES = ['pelvis', 'head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'forearm_l', 'forearm_r', 'shin_l', 'shin_r',
         'spine', 'chest', 'neck', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r']
PARENTS = [-1, 12, 13, 14, 0, 0, 2, 3, 4, 5, 0, 10, 11, 11, 11, 6, 7, 8, 9, 17, 18]
FOREARM, HAND, UPPER, CLAV = 7, 16, 3, 14
LEGS = [4, 5, 8, 9, 17, 18, 19, 20]
SECTORS, S0, S1, DS = 20, .08, .34, .01


def contract():
    src = CONTRACT.read_text()
    num = r'\{\s*x:\s*([-.\d]+),\s*y:\s*([-.\d]+),\s*z:\s*([-.\d]+)'
    c = {k: np.array(re.search('const ' + k + r'[^{]*' + num, src).groups(), float)
         for k in ['AXIS_ORIGIN', 'BARREL_AXIS', 'RADIAL_Z', 'MUZZLE', 'HAND_HEAD']}
    c['STATION'] = {k: float(v) for k, v in re.findall(r'(\w+):\s*([.\d]+)', re.search(r'STATION = \{([^}]*)\}', src).group(1))}
    c['VIEWS'] = [np.array(v, float) for v in re.findall(num, re.search(r'VIEWS[^=]*= \[(.*?)\];', src).group(1))]
    U = np.array([1., 0, 0]) - c['BARREL_AXIS'][0]*c['BARREL_AXIS']
    c['U'] = U/np.linalg.norm(U)
    return c


C = contract()
O, A, U, Z = C['AXIS_ORIGIN'], C['BARREL_AXIS'], C['U'], C['RADIAL_Z']/np.linalg.norm(C['RADIAL_Z'])


def rim_station(dz):
    st, c = C['STATION'], max(-1., min(1., dz))
    return st['cuffDorsal'] + (st['cuffFlexor'] - st['cuffDorsal'])*(1 - c)/2


def radial(theta):
    """Unit radial direction at angle theta: 0 = outer (U), -pi/2 = top (-RADIAL_Z), +pi/2 = underside."""
    return np.cos(theta)*U + np.sin(theta)*Z


chain = lambda i: [i] + (chain(PARENTS[i]) if PARENTS[i] >= 0 else [])


def read_glb(path):
    """(json, accessor reader) for a GLB file; float accessors come back as float64, integer ones as int64."""
    b = Path(path).read_bytes()
    n = struct.unpack('<I', b[12:16])[0]
    j, binary = json.loads(b[20:20+n]), b[20+n+8:]
    types, width = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}, {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def acc(i):
        a = j['accessors'][i]
        off = j['bufferViews'][a['bufferView']].get('byteOffset', 0) + a.get('byteOffset', 0)
        dt = np.dtype(types[a['componentType']])
        arr = np.frombuffer(binary, dt, a['count']*width[a['type']], off).reshape(a['count'], -1)
        return arr.astype(np.float64) if dt == np.float32 else arr.astype(np.int64)
    return j, acc


def load_suit():
    j, acc = read_glb(SUIT)
    remap = np.array([NAMES.index(j['nodes'][i]['name']) for i in j['skins'][0]['joints']])
    local = {x['name']: np.array(x.get('translation', [0, 0, 0])) for x in j['nodes'] if x.get('name') in NAMES}
    heads = np.array([sum(local[NAMES[k]] for k in chain(i)) for i in range(21)])
    meshes = {}
    for m in j['meshes']:
        p, at_ = m['primitives'][0], m['primitives'][0]['attributes']
        pos, jt, wt = acc(at_['POSITION']), remap[acc(at_['JOINTS_0'])], acc(at_['WEIGHTS_0'])
        w = np.zeros((len(pos), 21))
        np.add.at(w, (np.repeat(np.arange(len(w)), 4), jt.ravel()), wt.ravel())
        meshes[m['name'].replace(' mesh', '')] = {'pos': pos, 'w': w, 'tri': acc(p['indices']).reshape(-1, 3)}
    return {'meshes': meshes, 'heads': heads}


def stations(p):
    """Axis coordinate s and the (u, z) radial coordinates of forearm-frame points p (N,3)."""
    return (p - O) @ A, (p - O) @ U, (p - O) @ Z


def r1(suit):
    """Blaster-on weights R1 + R2 (R3 below) and each mesh's R1 rigid mask."""
    out, head = {}, suit['heads'][FOREARM]
    for name, m in suit['meshes'].items():
        w = m['w'].copy()
        s = stations(m['pos'] - head)[0]
        hw, fh, rigid = w[:, HAND].copy(), w[:, FOREARM] + w[:, HAND], np.zeros(len(w), bool)
        if name != 'Explorer eyes':
            under = np.full(len(w), name == 'Explorer undersuit')
            rigid = ((fh >= .5) & (s < C['STATION']['collapse'])) | (hw > 0) & (under | (s < .25))
            collapse = (hw > 0) & ~under & (s >= .25)
            keep = (hw > 0) & ~collapse
            w[collapse | keep] = 0
            w[collapse, HAND], w[keep, FOREARM] = 1, 1
            arm = w[:, [CLAV, UPPER, FOREARM, HAND]].sum(1) > 0
            w[np.ix_(arm, LEGS)] = 0
            w /= w.sum(1, keepdims=True)
        out[name] = {'w': w, 'rigid': rigid}
    return out


def r3(suit, weights, iterations=1500):
    """R3 (review stills only): harmonic arm fraction on the welded body near the right shoulder, as the runtime skin."""
    body = ['Explorer undersuit', 'Explorer anatomy']
    P, W = (np.concatenate([suit['meshes'][k]['pos'] for k in body]), np.concatenate([weights[k]['w'] for k in body]))
    _, first, weld = np.unique(np.round(P, 5), axis=0, return_index=True, return_inverse=True)
    lo = len(suit['meshes'][body[0]]['pos'])
    n, tri = len(first), weld[np.concatenate([suit['meshes'][body[0]]['tri'], suit['meshes'][body[1]]['tri'] + lo])]
    e = np.unique(np.sort(np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), 1), axis=0)
    e = e[e[:, 0] != e[:, 1]]
    arm, trunk = W[:, [UPPER, FOREARM]].sum(1), W[:, [0, 10, 11, CLAV]].sum(1)
    a, t = arm[first], trunk[first]
    free = (P[first, 0] > 0) & (np.linalg.norm(P[first] - suit['heads'][UPPER], axis=1) < .45) & (a > 0) & (t > 0)
    f, deg = a/np.maximum(a + t, 1e-12), np.maximum(np.bincount(e.ravel(), minlength=n), 1)
    for _ in range(iterations):
        f = np.where(free, (np.bincount(e[:, 0], f[e[:, 1]], n) + np.bincount(e[:, 1], f[e[:, 0]], n))/deg, f)
    sel = free[weld]
    k = f[weld][sel]*(arm + trunk)[sel]
    W[np.ix_(sel, [UPPER, FOREARM])] *= (k/arm[sel])[:, None]
    W[np.ix_(sel, [0, 10, 11, CLAV])] *= ((arm + trunk)[sel] - k)[:, None]/trunk[sel][:, None]
    out = dict(weights)
    out[body[0]], out[body[1]] = {**weights[body[0]], 'w': W[:lo]}, {**weights[body[1]], 'w': W[lo:]}
    return out


def rigid_points(suit, weights):
    return np.concatenate([m['pos'][weights[k]['rigid']] - suit['heads'][FOREARM] for k, m in suit['meshes'].items()])


def hull(points):
    """Per (sector, station) max radial distance, gap-filled, plus HAND_HEAD +6 mm and the cone to it."""
    ns = int(round((S1 - S0)/DS)) + 1
    h = np.full((SECTORS, ns), -1.)

    def add(pts):
        s, u, z = stations(pts)
        k = np.rint((s - S0)/DS).astype(int)
        sec = np.rint(np.arctan2(z, u)/(2*np.pi/SECTORS)).astype(int) % SECTORS
        ok = (k >= 0) & (k < ns)
        np.maximum.at(h, (sec[ok], k[ok]), np.hypot(u, z)[ok])
    add(points)
    while (h < 0).any():
        empty = h < 0
        nb = np.maximum.reduce([np.roll(h, 1, 0), np.roll(h, -1, 0),
                                np.pad(h, ((0, 0), (1, 0)), constant_values=-1)[:, :-1],
                                np.pad(h, ((0, 0), (0, 1)), constant_values=-1)[:, 1:]])
        h[empty] = nb[empty]
    hh = C['HAND_HEAD']
    s, u, z = stations(hh[None])
    extra = [hh + .006*(u[0]*U + z[0]*Z)/np.hypot(u[0], z[0])]
    k24 = int(round((.24 - S0)/DS))
    for i in range(SECTORS):
        ring = O + .24*A + h[i, k24]*radial(i*2*np.pi/SECTORS)
        extra += [ring + (hh - ring)*t for t in np.linspace(0, 1, 11)]
    add(np.array(extra))
    under = np.sin(np.arange(SECTORS)*2*np.pi/SECTORS) >= np.cos(np.radians(60))
    band = slice(int(round((.24 - S0)/DS)), int(round((.29 - S0)/DS)) + 1)
    h[under, band] = np.maximum(h[under, band], .052 - .007)
    return h


def euler(x, y, z):
    """three.js Euler XYZ rotation matrix."""
    cx, sx, cy, sy, cz, sz = np.cos(x), np.sin(x), np.cos(y), np.sin(y), np.cos(z), np.sin(z)
    return np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]) @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @ np.array(
        [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])


def bone_world(heads, rot, scale=None):
    """World 4x4 per bone; rot maps bone index to a 3x3 local rotation; scale maps bone index to a uniform scale."""
    world = np.zeros((21, 4, 4))
    for i in sorted(range(21), key=lambda k: len(chain(k))):
        local = np.eye(4)
        local[:3, :3] = rot.get(i, np.eye(3))*(scale or {}).get(i, 1)
        local[:3, 3] = heads[i] - (heads[PARENTS[i]] if PARENTS[i] >= 0 else 0)
        world[i] = (world[PARENTS[i]] if PARENTS[i] >= 0 else np.eye(4)) @ local
    return world


def skin(pos, w, heads, world):
    """Linear blend skinning with identity bind rotations: v' = sum w_j W_j (v - head_j)."""
    out = np.zeros_like(pos)
    for j in np.nonzero(w.any(0))[0]:
        out += w[:, j:j+1]*((pos - heads[j]) @ world[j][:3, :3].T + world[j][:3, 3])
    return out


AIM = {14: (0, .1, 0), 3: (1.571, 0, -.124), 7: (0, 0, 0)}
POSES = {'CARRY': {14: (0, .05, 0), 3: (.5, 0, .4), 7: (.9, 0, 0)}, 'AIM': AIM, 'VENT': {**AIM, 7: (.52, 0, 0)}, 'STRESS': {**AIM, 7: (1.55, 0, 0)}}


def pose(suit, weights, locals_):
    """Posed mesh positions (blaster on: R1 weights, hand_r scale 1e-3) and the bone world matrices."""
    world = bone_world(suit['heads'], {k: euler(*v) for k, v in locals_.items()}, {HAND: 1e-3})
    return {k: skin(m['pos'], weights[k]['w'], suit['heads'], world) for k, m in suit['meshes'].items()}, world
