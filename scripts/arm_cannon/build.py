"""Build public/models/arm-cannon.glb reproducibly and record docs/art/arm-cannon/asset.json.

perl -e 'alarm 900; exec @ARGV' /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/arm_cannon/build.py
Geometry is authored in the contract frame (three.js axes) and mapped to Blender with b = (x, -z, y); the Y-up export maps
it back exactly. Measurements are taken from the exported GLB itself."""
import hashlib
import json
import sys
import tempfile
from math import radians
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).parent))
import fit  # noqa: E402
import palette  # noqa: E402
import parts  # noqa: E402
import pod as core_pod  # noqa: E402

OUT = fit.ROOT/'public/models/arm-cannon.glb'
DOC = fit.ROOT/'docs/art/arm-cannon'
TO3 = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1.]])   # Blender -> three


def make_object(name, data, parent, m3=None):
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    if m3 is not None:
        obj.matrix_world = Matrix((TO3.T @ m3 @ TO3).tolist())
    return obj


def weighted_normals(obj):
    mod = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    mod.mode, mod.weight, mod.keep_sharp = 'FACE_AREA', 50, True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    obj.modifiers.remove(mod)
    old, obj.data = obj.data, me
    me.name = old.name
    bpy.data.meshes.remove(old)
    assert me.has_custom_normals, obj.name


def trs(origin, rows=np.eye(3)):
    m = np.eye(4)
    m[:3, :3], m[:3, 3] = np.array(rows).T, origin
    return m


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    suit = fit.load_suit()
    weights = fit.r1(suit)
    env = parts.envelope(fit.hull(fit.rigid_points(suit, weights)))
    pod, hatch, hinge, lens, mouth = core_pod.pod()
    barrel, bore = parts.barrel()
    mat = palette.material(palette.write(tempfile.mkdtemp()))
    mat.use_backface_culling = True
    root = make_object('arm_cannon', None, None)
    meshes = [make_object('cannon_shell', palette.node_mesh('cannon_shell', [parts.shell_lathe(env), barrel, bore, parts.fins(env[0]), pod],
                                                    flips=(2,)), root),
              make_object('cannon_slide', palette.node_mesh('cannon_slide', [parts.slide()]), root, trs(fit.O + .40*fit.A)),
              make_object('cannon_vent', palette.node_mesh('cannon_vent', [hatch]), root, trs(*hinge))]
    for obj in meshes:
        obj.data.materials.append(mat)
        weighted_normals(obj)
    for name, p in [('cannon_muzzle', fit.C['MUZZLE']), ('cannon_core', lens), ('cannon_vent_mouth', mouth)]:
        make_object(name, None, root, trs(p))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=False, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
                              export_animations=False, export_skins=False, export_morph=False, export_extras=False,
                              export_cameras=False, export_lights=False, export_image_format='AUTO')
    return suit, weights


def glb_nodes(path):
    """Node matrices (children of the identity root) and each mesh's vertices, triangles and palette slot per triangle."""
    j, acc = fit.read_glb(path)
    nodes, meshes = {}, {}
    for n in j['nodes']:
        x, y, z, w = n.get('rotation', [0, 0, 0, 1])
        m = np.eye(4)
        m[:3, :3] = np.array([[1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)], [2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)],
                              [2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y)]])*np.array(n.get('scale', [1, 1, 1]))
        m[:3, 3] = n.get('translation', [0, 0, 0])
        nodes[n['name']] = m
        if 'mesh' in n:
            p = j['meshes'][n['mesh']]['primitives'][0]
            v = acc(p['attributes']['POSITION']) @ m[:3, :3].T + m[:3, 3]
            uv, tri = acc(p['attributes']['TEXCOORD_0']), acc(p['indices']).reshape(-1, 3)
            meshes[n['name']] = (v, tri, (np.floor(uv[tri[:, 0], 1]*4)*4 + np.floor(uv[tri[:, 0], 0]*4)).astype(int))
    return nodes, meshes


def bvh(v, t):
    return BVHTree.FromPolygons([tuple(p) for p in v], [tuple(int(i) for i in f) for f in t])


def ray(tree, p, d):
    hit = tree.ray_cast(Vector(p), Vector(d))
    return hit[3] if hit[0] is not None else float('inf')


def samples(a, b, c, k=5):
    """k*k equal-area sub-triangle centroids."""
    out = [a + (b - a)*(i + 1/3)/k + (c - a)*(j + 1/3)/k for i in range(k) for j in range(k - i)]
    return out + [a + (b - a)*(i + 2/3)/k + (c - a)*(j + 2/3)/k for i in range(k) for j in range(k - i - 1)]


def visibility(V, T, S, names, tree):
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    cr = np.cross(b - a, c - a)
    area, nrm = np.linalg.norm(cr, axis=1)/2, cr/np.linalg.norm(cr, axis=1, keepdims=True)
    sel = np.nonzero(np.isin(S, [palette.slot(x) for x in names]))[0]
    out = []
    for view in fit.C['VIEWS']:
        vis = proj = 0
        for i in sel:
            ok = [nrm[i] @ view > 0 and ray(tree, p + .001*view, view) == float('inf') for p in samples(a[i], b[i], c[i])]
            vis += area[i]*np.mean(ok)
            proj += area[i]*np.mean(ok)*max(0, nrm[i] @ view)
        out.append({'visible_fraction': round(vis/area[sel].sum(), 3), 'projected_m2': round(proj, 6)})
    return out


def report(path, suit, weights):
    nodes, ms = glb_nodes(path)
    off = np.cumsum([0] + [len(m[0]) for m in ms.values()])
    V = np.concatenate([m[0] for m in ms.values()])
    T = np.concatenate([m[1] + o for m, o in zip(ms.values(), off)])
    S = np.concatenate([m[2] for m in ms.values()])
    s, u, z = fit.stations(V)
    widths = [np.ptp(u*np.cos(f) + z*np.sin(f)) for f in np.radians(np.arange(180))]
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1)/2
    outer = S != palette.slot('inner')
    metal = np.isin(S, [palette.slot(k) for k in palette.METAL])
    tree, shell = bvh(V, T), bvh(*ms['cannon_shell'][:2])
    pts = fit.rigid_points(suit, weights)
    ps, pu, pz = fit.stations(pts)
    keep = (ps >= np.array([fit.rim_station(d) for d in pz/np.hypot(pu, pz)]) + .01) & (ps <= .30)
    foot = lambda p: fit.O + fit.stations(p[None])[0][0]*fit.A
    gap = lambda p: ray(shell, p, (p - foot(p))/np.linalg.norm(p - foot(p)))
    clear = [gap(p) for p in pts[keep]]
    hh = fit.C['HAND_HEAD']
    ring = pts[np.abs(ps - .24) < .005]
    cone = [.5*(ring[np.argmax(np.where(np.rint(np.arctan2(pz, pu)/(np.pi/10))[np.abs(ps - .24) < .005] % 20 == k,
                                         np.hypot(pu, pz)[np.abs(ps - .24) < .005], -1))] + hh) for k in range(20)]
    flex = {}
    body = ['Explorer undersuit', 'Explorer anatomy']
    boff = np.cumsum([0] + [len(suit['meshes'][k]['pos']) for k in body])
    bt = np.concatenate([suit['meshes'][k]['tri'] + o for k, o in zip(body, boff)])
    # The runtime blaster skin (R1 + the R3 harmonic arm share): with R1 alone the forearm vertices that keep rig.py's spine share
    # (up to .06) lag the abducted carry arm and read as a 17 mm overlap that the runtime weights never show.
    w3 = fit.r3(suit, weights)
    fore = np.concatenate([w3[k]['w'][:, fit.FOREARM] + w3[k]['w'][:, fit.HAND] for k in body])[bt].mean(1)
    for name, loc in fit.POSES.items():   # upper arm, biceps and elbow crease: triangles under 95% forearm/hand
        posed, world = fit.pose(suit, w3, loc)
        tree_b = bvh(np.concatenate([posed[k] for k in body]), bt[fore < .95])
        worst = float('inf')
        for v in V @ world[fit.FOREARM][:3, :3].T + world[fit.FOREARM][:3, 3]:
            hit, n, i, d = tree_b.find_nearest(Vector(v))
            worst = min(worst, -d if d < .02 and (Vector(v) - hit) @ n < 0 else d)
        flex[name] = {'min_mm_to_upper_arm': round(worst*1000, 2), 'pass': worst > -.003}
    return {
        'triangles': {k: len(m[1]) for k, m in ms.items()}, 'triangles_total': len(T),
        'muzzle_residual_mm': round(float(np.linalg.norm(nodes['cannon_muzzle'][:3, 3] - fit.C['MUZZLE']))*1000, 3),
        'vent_hinge_dot_axis': round(float(nodes['cannon_vent'][:3, 0] @ fit.A), 4),
        'length_m': round(float(np.ptp(s)), 4), 'largest_extent_m': round(float(max(widths)), 4),
        'extent_u_by_z_m': [round(float(np.ptp(u)), 4), round(float(np.ptp(z)), 4)],
        'radial_extent_m': {k: round(float(x), 4) for k, x in (('top', -z.min()), ('outer', u.max()), ('underside', z.max()), ('inner', -u.min()))},
        'length_over_extent': round(float(np.ptp(s)/max(widths)), 3),
        'min_cuff_clearance_mm': round(min(clear)*1000, 2), 'min_cuff_clearance_station': round(float(ps[keep][np.argmin(clear)]), 3),
        'hand_head_inset_mm': round(gap(hh)*1000, 2), 'cone_min_inset_mm': round(min(gap(p) for p in cone)*1000, 2),
        'metal_area_pct': round(float(area[metal & outer].sum()/area[outer].sum()*100), 1),
        'flexion': flex, 'cuff_flexor': fit.C['STATION']['cuffFlexor'],
        'visibility': {'views': ['chase', 'ads_portrait', 'ads_landscape'], 'core_lens': visibility(V, T, S, ['lens'], tree),
                       'strips_fins': visibility(V, T, S, ['strip', 'finglow'], tree)}}


if __name__ == '__main__':
    suit, weights = build()
    report = {'asset': str(OUT.relative_to(fit.ROOT)), 'blender': bpy.app.version_string,
              'method': 'Measured on the exported GLB. Extent: widest projection perpendicular to BARREL_AXIS. Flexion (runtime R1 + R3 weights, '
                        'hand_r 1e-3): nearest posed triangle under 95% forearm/hand weight, negative = inside (within 2 cm).',
              'sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(),
              'bytes': OUT.stat().st_size, **report(OUT, suit, weights)}
    DOC.mkdir(parents=True, exist_ok=True)
    prior = json.loads((DOC/'asset.json').read_text()) if (DOC/'asset.json').exists() else {}
    report['consecutive_builds_identical'] = prior.get('sha256') == report['sha256']
    (DOC/'asset.json').write_text(json.dumps(report, indent=2) + '\n')
    print('[arm-cannon]', json.dumps(report))
