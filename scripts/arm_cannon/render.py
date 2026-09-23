"""Review stills for the arm cannon (run after build.py; writes docs/art/arm-cannon/review.png and closeup.png).

perl -e 'alarm 900; exec @ARGV' /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/arm_cannon/render.py
The suit is posed in Python (linear blend skinning, blaster weights R1-R3, hand_r scale 1e-3; not the Blender armature) and the
cannon GLB is parented to the posed forearm matrix. Cameras follow the game: vertical FOV, head = pelvis origin + .65 m."""
import re, sys, tempfile  # noqa: E401
from math import radians
from pathlib import Path
import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
sys.path.insert(0, str(Path(__file__).parent))
import fit  # noqa: E402
import palette  # noqa: E402

DOC, TMP = fit.ROOT/'docs/art/arm-cannon', Path(tempfile.mkdtemp())
B = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0.]])            # three -> Blender
lin = lambda h: np.array([(int(h[i:i+2], 16)/255)**2.2 for i in (1, 3, 5)])
HEAD = np.array([0, .65, 0])
AIM = {fit.CLAV: (0, .1, 0), fit.UPPER: (1.571, 0, -.124), fit.FOREARM: (0, 0, 0)}
CARRY = {fit.CLAV: (0, .05, 0), fit.UPPER: (.5 - .12, 0, .4), fit.FOREARM: (.9, 0, 0)}
VENT = {fit.FOREARM: (.52, 0, 0), fit.UPPER: (0, .21, 0), 12: (-.056, -.105, 0), 1: (-.084, -.157, 0)}
# state: (core colour x intensity, strip colour x intensity, fin colour x intensity, vent open, slide back)
HEAT = {'cyan': (lin('#00c8ff')*.45, lin('#00b8ff')*.45, lin('#00b8ff')*0, 0, 0),
        'amber': (lin('#ffb347')*.45, lin('#ffb347')*.45, lin('#ffb347')*0, 0, 0),
        'red': (lin('#ff3a10')*.45, lin('#ff3a10')*.45, lin('#ff3a10')*.3, 0, 0),
        'overheat': (lin('#ff3a10')*.3, lin('#ff3a10')*.45, lin('#ff3a10')*.45, 1, 1)}
RING, VENT_MAX = lin('#00c8ff')*.2, float(re.search(r'VENT_MAX = (\d+) \*', fit.CONTRACT.read_text()).group(1))


def material(name, rgb, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value, p.inputs['Roughness'].default_value = list(rgb) + [1], rough
    return m


def setup(suit):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine, sc.eevee.taa_render_samples, sc.eevee.use_gtao = 'BLENDER_EEVEE', 64, True
    sc.view_settings.view_transform = 'Filmic'
    sc.world = bpy.data.worlds.new('sky')
    sc.world.use_nodes = True
    nt = sc.world.node_tree
    tc, sep, rng, mix = (nt.nodes.new(k) for k in ['ShaderNodeTexCoord', 'ShaderNodeSeparateXYZ', 'ShaderNodeMapRange', 'ShaderNodeMix'])
    mix.data_type, rng.inputs['From Min'].default_value = 'RGBA', -1
    mix.inputs[6].default_value, mix.inputs[7].default_value = list(lin('#737657')) + [1], list(lin('#c0dbed')) + [1]
    for a, b in [(tc.outputs['Generated'], sep.inputs[0]), (sep.outputs['Z'], rng.inputs['Value']), (rng.outputs['Result'], mix.inputs['Factor']),
                 (mix.outputs[2], nt.nodes['Background'].inputs['Color'])]:
        nt.links.new(a, b)
    nt.nodes['Background'].inputs['Strength'].default_value = 1.7
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy, sun.data.color, sun.data.angle = 3.5, lin('#ffe6b2'), radians(3)
    sun.rotation_euler = Vector(B @ np.array([-65, 100, 80.])).to_track_quat('Z', 'Y').to_euler()
    sc.collection.objects.link(sun)
    objs = {}
    look = {'Explorer undersuit': ((.095, .125, .15), .8), 'Explorer anatomy': ((.38, .32, .275), .65), 'Explorer eyes': ((.26, .255, .235), .5),
            'ground': ((.18, .17, .15), .9)}
    geo = {k: (m['pos'], m['tri']) for k, m in suit['meshes'].items()}
    geo['ground'] = (np.array([(-9, -.97, -9), (9, -.97, -9), (9, -.97, 9), (-9, -.97, 9.)]), np.array([(0, 3, 2, 1)]))
    for name, (pos, tri) in geo.items():
        me = bpy.data.meshes.new(name)
        me.from_pydata((pos @ B.T).tolist(), [], tri.tolist())
        me.polygons.foreach_set('use_smooth', [True]*len(me.polygons))
        me.materials.append(material(name, *look[name]))
        objs[name] = bpy.data.objects.new(name, me)
        sc.collection.objects.link(objs[name])
    bpy.ops.import_scene.gltf(filepath=str(fit.ROOT/'public/models/arm-cannon.glb'))
    return objs, {k: bpy.data.objects[k] for k in ['arm_cannon', 'cannon_vent', 'cannon_slide']}


def state(parts, rest, heat):
    """Stills emissive (the runtime patch at fixed values) written into the mask texture, plus hatch and slide."""
    core, strip, fins, vent, slide = HEAT[heat]
    img = next(i for i in bpy.data.images if 'emit' in i.name)
    img.colorspace_settings.name = 'Non-Color'
    mask = np.array(palette.maps()['emit'], float)[::-1]/255
    g = mask[..., 1:2]
    img.pixels = np.concatenate([mask[..., :1]*core + (g >= .75)*strip + ((g >= .25) & (g < .75))*fins + mask[..., 2:3]*RING,
                                 np.ones((8, 8, 1))], 2).ravel().tolist()
    parts['cannon_vent'].matrix_basis = rest[0] @ Matrix.Rotation(np.radians(VENT_MAX)*vent, 4, 'X')
    parts['cannon_slide'].matrix_basis = Matrix.Translation(Vector(B @ (-fit.A*.025*slide))) @ rest[1]


def arc(d, t):
    v, c = np.cross(d, t), float(d @ t)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k/(1 + c)


def pose(suit, weights, objs, parts, loc, target=None, extra=None):
    """Pose the suit (Euler XYZ locals by bone), swing upperarm_r so the barrel points at target (3 passes), then extras."""
    rot = {k: fit.euler(*v) for k, v in loc.items()}
    for _ in range(3 if target is not None else 0):
        w = fit.bone_world(suit['heads'], rot)
        muzzle = w[7][:3, :3] @ fit.C['MUZZLE'] + w[7][:3, 3]
        q = w[fit.CLAV][:3, :3]
        rot[fit.UPPER] = q.T @ arc(w[7][:3, :3] @ fit.A, (target - muzzle)/np.linalg.norm(target - muzzle)) @ q @ rot[fit.UPPER]
    for k, v in (extra or {}).items():
        rot[k] = rot.get(k, np.eye(3)) @ fit.euler(*v)
    world = fit.bone_world(suit['heads'], rot, {fit.HAND: 1e-3})
    for name, m in suit['meshes'].items():
        objs[name].data.vertices.foreach_set('co', (fit.skin(m['pos'], weights[name]['w'], suit['heads'], world) @ B.T).ravel())
        objs[name].data.update()
    m4 = np.eye(4)
    m4[:3, :3], m4[:3, 3] = B @ world[7][:3, :3] @ B.T, B @ world[7][:3, 3]
    parts['arm_cannon'].matrix_world = Matrix(m4.tolist())
    return world


def shoot(pos, look, fov, size, name, mark=None):
    """Render from a three-space camera; returns the image and, if mark is a three-space point, its pixel position."""
    sc = bpy.context.scene
    if not sc.camera:
        sc.camera = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        sc.collection.objects.link(sc.camera)
    cam = sc.camera
    cam.data.sensor_fit, cam.data.angle_y, cam.data.clip_start = 'VERTICAL', radians(fov), .02
    cam.location = Vector(B @ np.asarray(pos, float))
    cam.rotation_euler = Vector(B @ (np.asarray(look, float) - pos)).to_track_quat('-Z', 'Y').to_euler()
    (sc.render.resolution_x, sc.render.resolution_y), sc.render.filepath = size, str(TMP/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(sc.render.filepath)
    px = (np.clip(np.array(img.pixels[:]).reshape(size[1], size[0], 4)[::-1, :, :3], 0, 1)*255).astype(np.uint8)
    bpy.data.images.remove(img)
    bpy.context.view_layer.update()
    if mark is None:
        return px
    p = world_to_camera_view(sc, cam, Vector(B @ mark))
    return px, (p.x*size[0], (1 - p.y)*size[1])


def sheet(rows, pad=6):
    width = max(sum(t.shape[1] + pad for t in r) for r in rows) + pad
    bands = []
    for r in rows:
        band = np.full((max(t.shape[0] for t in r) + pad, width, 3), 24, np.uint8)
        x = pad
        for t in r:
            band[pad:pad + t.shape[0], x:x + t.shape[1]] = t
            x += t.shape[1] + pad
        bands.append(band)
    return np.concatenate(bands + [np.full((pad, width, 3), 24, np.uint8)])


def zoom(img, c, half=40, k=4):
    x, y = (min(max(int(round(v)), half), n - half) for v, n in zip(c, img.shape[1::-1]))
    return img[y - half:y + half, x - half:x + half].repeat(k, 0).repeat(k, 1)


def main():
    suit = fit.load_suit()
    weights = fit.r3(suit, fit.r1(suit))
    objs, parts = setup(suit)
    rest = [parts['cannon_vent'].matrix_basis.copy(), parts['cannon_slide'].matrix_basis.copy()]
    boom = lambda b, pitch=-.12: (HEAD + fit.euler(pitch, 0, 0) @ np.array(b), HEAD + fit.euler(pitch, 0, 0) @ (np.array(b) + [0, 0, -30]))
    centre = lambda w, s=.28: w[7][:3, :3] @ (fit.O + s*fit.A) + w[7][:3, 3]
    state(parts, rest, 'cyan')
    frames, crops = [], []
    for label, loc, b, fov, sizes, extra in [('aim', AIM, (.85, .7, 5.3), 65, [(390, 844), (844, 390)], None),
                                             ('carry', CARRY, (.85, .7, 5.3), 65, [(390, 844), (844, 390)], None),
                                             ('ads', AIM, (.44, .55, 3.4), 50, [(390, 844)], None),
                                             ('adsL', AIM, (.85, .45, 2.6), 50, [(844, 390)], None),
                                             ('vent', AIM, (.85, .7, 5.3), 65, [(390, 844)], VENT)]:
        cam, target = boom(b)
        state(parts, rest, 'overheat' if label == 'vent' else 'cyan')
        w = pose(suit, weights, objs, parts, loc, None if loc is CARRY else target, extra)
        for size in sizes:
            img, px = shoot(cam, target, fov, size, f'{label}{size[0]}', centre(w))
            frames.append(img)
            crops.append(zoom(img, px))
    state(parts, rest, 'cyan')
    for label, loc in [('stress', {**AIM, fit.FOREARM: (1.55, 0, 0)}), ('flight', {fit.UPPER: (.3, 0, -.4), fit.FOREARM: (.3, 0, 0)})]:
        w = pose(suit, weights, objs, parts, loc)
        c = centre(w, .2)
        frames.append(shoot(c + [1.6, .15, .1], c, 22, (420, 420), label))
    f = frames
    palette.png(DOC/'review.png', sheet([[f[0], f[2], f[4], f[6]], [f[1], f[3]], [f[5], f[7], f[8]], crops[:4], crops[4:]]))
    cam, target = boom((.85, .7, 5.3))
    w = pose(suit, weights, objs, parts, AIM, target)
    R, c = w[7][:3, :3], centre(w)
    shots = [(c + R @ (fit.C['VIEWS'][0]*.9), c, 30, 'behind'),
             (c + R @ (-fit.A*.55 + fit.radial(np.radians(-45))*.5), c, 32, 'three-quarter'),
             (c + R @ (-fit.A*.25 + fit.radial(np.radians(-20))*.35), centre(w, .14), 34, 'cuff')]
    tiles = [shoot(p, look, fov, (1024, 1024), n)[::2, ::2] for p, look, fov, n in shots]
    for heat in HEAT:
        state(parts, rest, heat)
        tiles.append(shoot(c + R @ (fit.A*.25 + fit.radial(np.radians(-40))*.6), c, 30, (1024, 1024), heat)[::2, ::2])
    palette.png(DOC/'closeup.png', sheet([tiles[:3], tiles[3:]]))


if __name__ == '__main__':
    main()
