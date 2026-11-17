"""Workbench stills of the built GLBs, read back through Blender's glTF importer (so the stills check the GLB itself):
each body at rest and at the impact frame of its cut0 (Sword_Regular_A), front and side, plus references at the same scale, and one sheet.

  Blender -b --factory-startup --python-exit-code 1 --python render.py -- --out <build dir> [--angel <game angel.glb>] [--ual2 <UAL2_Standard.glb>]
"""
import argparse
import json
import sys
from math import radians
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--angel')
parser.add_argument('--ual2')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(args.out)
report = json.loads((out / 'report.json').read_text())
STRIKE = {name: cuts['cut0']['impact'] for name, cuts in report['cuts'].items()}  # seconds into cut0
W, H, FRAME = 800, 900, 2.7  # pixels and metres (frame height) of every full-body still, so sizes compare


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.world = bpy.data.worlds.new('plain')
    sc.world.color = (.78, .78, .76)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = FRAME
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == 'ARMATURE')
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        for m in o.data.materials:
            # Workbench only honours a texture's alpha on non-opaque materials (the GLB itself says alphaMode MASK).
            if m and m.name.endswith(('face', 'hair')):
                m.blend_method = 'CLIP'
                m.alpha_threshold = .35
            elif m and m.name.endswith('bronze'):
                m.metallic, m.roughness = 1.0, .4  # Workbench reads the viewport values, not the node tree
    if rig.animation_data:
        for t in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(t)
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    return rig, meshes


def bounds(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        m = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in m.vertices]
        ev.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def pose_at(rig, clip, seconds):
    """Set an imported action at a time in seconds; returns the frame used."""
    found = [a for a in bpy.data.actions if a.name in (clip, f'{clip}_{rig.name}')]
    if not found:
        raise SystemExit(f'no action {clip}: {[a.name for a in bpy.data.actions]}')
    act = found[0]
    rig.animation_data_create()
    rig.animation_data.action = act
    fps = bpy.context.scene.render.fps
    frame = act.frame_range[0] + seconds * fps
    bpy.context.scene.frame_set(int(frame), subframe=frame - int(frame))
    return act.name, frame


def shoot(sc, cam, meshes, sole, name, facing):
    """facing: the Blender direction the model faces (+Y for the game GLBs, -Y for the UAL mannequin)."""
    lo, hi = bounds(meshes)
    centre = (lo + hi) / 2
    for view, d in (('front', facing), ('side', Vector((-facing.y, facing.x, 0)))):
        cam.location = Vector((centre.x, centre.y, sole + FRAME / 2 - .1)) + d * 10
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        path = out / 'renders' / f'{name}-{view}.png'
        sc.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print('RENDER', path)


def closeup(sc, cam, rig, bone, name, size, facing, lift=0.0):
    """A tight front still centred on one bone (head, sword hand), to judge face, brows and grip."""
    p = rig.matrix_world @ rig.pose.bones[bone].head + Vector((0, 0, lift))
    cam.data.ortho_scale = size
    cam.location = p + facing * 10
    cam.rotation_euler = (-facing).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = str(out / 'renders' / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    cam.data.ortho_scale = FRAME
    print('RENDER', sc.render.filepath)


(out / 'renders').mkdir(exist_ok=True)
for name in report['bodies']:
    sc, cam = scene_setup()
    rig, meshes = load(out / f'{name}.glb')
    sole = bounds(meshes)[0].z
    shoot(sc, cam, meshes, sole, f'{name}-rest', Vector((0, 1, 0)))
    closeup(sc, cam, rig, 'head', f'{name}-closeup-head', .42, Vector((0, 1, 0)), .08)
    closeup(sc, cam, rig, 'hand_r', f'{name}-closeup-hand-rest', .32, Vector((-1, 0, 0)), -.06)
    used = pose_at(rig, 'cut0', STRIKE[name])
    print('STRIKE', name, used)
    shoot(sc, cam, meshes, sole, f'{name}-strike', Vector((0, 1, 0)))
    closeup(sc, cam, rig, 'hand_r', f'{name}-closeup-hand-strike', .4, Vector((0, 1, 0)))
if args.angel:
    sc, cam = scene_setup()
    rig, meshes = load(args.angel)
    shoot(sc, cam, meshes, bounds(meshes)[0].z, 'game-angel-rest', Vector((0, 1, 0)))
if args.ual2:
    sc, cam = scene_setup()
    rig, meshes = load(args.ual2)
    sole = bounds(meshes)[0].z
    print('STRIKE ual2', pose_at(rig, 'Sword_Regular_A', next(iter(STRIKE.values()))))
    shoot(sc, cam, meshes, sole, 'ual2-mannequin-strike', Vector((0, -1, 0)))

# Contact sheet: one row per body (rest front, rest side, strike front, strike side), then the references.
rows = [[f'{n}-{p}-{v}' for p in ('rest', 'strike') for v in ('front', 'side')] for n in report['bodies']]
rows.append([n for n in ('game-angel-rest-front', 'game-angel-rest-side', 'ual2-mannequin-strike-front', 'ual2-mannequin-strike-side')])
sheet = np.ones((H * len(rows), W * 4, 4), dtype=np.float32)
for r, row in enumerate(rows):
    for c, key in enumerate(row):
        p = out / 'renders' / f'{key}.png'
        if not p.exists():
            continue
        img = bpy.data.images.load(str(p))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
        sheet[(len(rows) - 1 - r) * H:(len(rows) - r) * H, c * W:(c + 1) * W] = px
img = bpy.data.images.new('sheet', W * 4, H * len(rows))
img.pixels = sheet.ravel()
img.file_format = 'PNG'
img.filepath_raw = str(out / 'renders' / 'contact-sheet.png')
img.save()
print('SHEET', out / 'renders' / 'contact-sheet.png')
