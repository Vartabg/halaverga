"""Build public/models/angel.glb from the Quaternius CC0 packs (see packs.py and docs/art/angel-asset/PROVENANCE.md).

Run from the repository root:
  Blender --background --factory-startup --python scripts/angel_asset/build.py -- --packs <folder of extracted packs>
"""
import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path
import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from packs import load  # noqa: E402
from rest import bake, finger_pose, pose_rest  # noqa: E402
from assemble import NAMES, build_rig, decimate, head_only, join, mirrored, placement, reweight, share_materials, single_uv  # noqa: E402
from retarget import sample  # noqa: E402
import glbclips  # noqa: E402
import textures  # noqa: E402

# Game clip name: (library, source clip). Idle and strike come from the libraries; flight stays the game's own clips.
CLIPS = {'idle': ('ual1', 'Idle_Loop'), 'swordIdle': ('ual1', 'Sword_Idle'), 'slash': ('ual1', 'Sword_Attack'),
         'rebuke': ('ual1', 'Spell_Simple_Shoot'), 'cast': ('ual2', 'OverhandThrow')}

parser = argparse.ArgumentParser()
parser.add_argument('--packs', required=True)
parser.add_argument('--out', default=str(ROOT/'public/models/angel.glb'))
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

bpy.ops.wm.read_factory_settings(use_empty=True)
libraries = {key: load(args.packs, key) for key in ('ual1', 'ual2')}
ual_rig, _, ual_clips = libraries['ual1']
grip = finger_pose(ual_rig, ual_clips['Sword_Idle'], ual_clips['Sword_Idle'].frame_range[0])
relaxed = finger_pose(ual_rig, ual_clips['Idle_Loop'], ual_clips['Idle_Loop'].frame_range[0])
fingers = {k: v for k, v in relaxed.items() if k.endswith('_l')} | {k: v for k, v in grip.items() if k.endswith('_r')}

parts = {}
for key in ('hero', 'hair', 'peasant', 'ranger'):
    rig, meshes, _ = load(args.packs, key)
    pose_rest(rig, fingers)
    head = rig.matrix_world @ rig.pose.bones['Head'].head
    bake(rig, meshes)
    parts[key] = (rig, meshes, head)
body = next(m for m in parts['hero'][1] if m.name.startswith('SuperHero_Male'))
head_only(body)
# The long hair is fitted to a shorter base body: seat it on this head.
for m in parts['hair'][1]:
    m.data.transform(Matrix.Translation(parts['hero'][2]-parts['hair'][2]))
ranger = parts['ranger'][1]
pauldron = next(m for m in ranger if m.name.startswith('Male_Ranger_Acc_Pauldron'))
ranger.append(mirrored(pauldron, 'Pauldron right'))
for m in ranger:
    if m.name.startswith('Male_Ranger_Feet_Boots'):
        decimate(m, 4000)
meshes = [m for _, ms, _ in parts.values() for m in ms]
for m in meshes:
    single_uv(m)
sole = min(v.co.z for m in meshes for v in m.data.vertices)
place, scale = placement(parts['peasant'][0], sole)
rig = build_rig(parts['peasant'][0], place)
for m in meshes:
    reweight(m)
materials = share_materials(meshes)
texture_report = textures.process(materials, tempfile.mkdtemp(prefix='angel-textures-'))


def leg(r):
    pose_rest(r)
    return (r.matrix_world @ r.pose.bones['thigh_l'].head).z-(r.matrix_world @ r.pose.bones['foot_l'].head).z


hip_scale = scale*leg(parts['peasant'][0])/leg(ual_rig)
angel = join(meshes, rig, place)
for r, _, _ in parts.values():
    bpy.data.objects.remove(r, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
angel.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', use_selection=True, export_animations=False,
                          export_skins=True, export_yup=True, export_apply=False, export_materials='EXPORT',
                          export_texcoords=True, export_normals=True, export_tangents=False, export_image_format='AUTO')
clips = {}
for name, (library, source) in CLIPS.items():
    lib_rig, _, lib_clips = libraries[library]
    clips[name] = sample(lib_rig, lib_clips[source], hip_scale)
glbclips.embed(args.out, clips, NAMES)

out = Path(args.out)
report = {'bytes': out.stat().st_size, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
          'triangles': sum(len(p.vertices)-2 for p in angel.data.polygons), 'vertices': len(angel.data.vertices),
          'materials': [m.name for m in angel.data.materials], 'textures': texture_report, 'scale': round(scale, 4),
          'clips': {n: {'source': f'{CLIPS[n][0]}/{CLIPS[n][1]}', 'seconds': round(c['times'][-1], 3), 'frames': len(c['times'])}
                    for n, c in clips.items()}}
(ROOT/'art/angel-asset').mkdir(parents=True, exist_ok=True)
(ROOT/'art/angel-asset/asset.json').write_text(json.dumps(report, indent=2)+'\n')
print('ANGEL_ASSET', json.dumps(report))
