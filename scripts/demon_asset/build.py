"""Build the game's imp from Quaternius Bestiary (QAL) and UAL clips (CC0).
Blender --background --factory-startup --python scripts/demon_asset/build.py -- --pack <extracted kit> --libraries <packs>
"""
import argparse
import hashlib
import json
import sys
import tempfile
from math import pi
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/angel_asset'))
from packs import load
from rest import pose_rest, bake
from assemble import NAMES, build_rig, reweight, join, single_uv
from retarget import sample
import glbclips

args = argparse.ArgumentParser()
args.add_argument('--pack', required=True)
args.add_argument('--libraries', required=True)
args = args.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
source = Path(args.pack)/'Exports/GLB (Godot-Unreal)/Imp.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
# Importer names the eyes separately; keep all character surfaces except chains, mace and display spheres.
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and not any(k in o.name for k in ('Chains', 'Mace'))]
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)
pose_rest(rig)
bake(rig, meshes)
# Eye/head fit is calibrated from the actual body, preserving the combat centre at (.0,.737,-.24).
head = rig.matrix_world @ rig.pose.bones['Head'].head
pelvis = rig.matrix_world @ rig.pose.bones['pelvis'].head
scale = .64/(head.z-pelvis.z)
place = Matrix.Rotation(pi, 4, 'Z') @ Matrix.Scale(scale, 4) @ Matrix.Translation(-pelvis)
newrig = build_rig(rig, place)
for o in meshes:
    reweight(o)
    single_uv(o)
# Keep the collar as a breakable plate; all other surfaces merge to one textured body draw.
collar = [o for o in meshes if 'Collar' in o.name]
body = join([o for o in meshes if o not in collar], newrig, place); body.name = 'body'
plate = join(collar, newrig, place); plate.name = 'plate'
# Original membrane surfaces remain on the existing four-joint-per-side wing rig.
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'art/demon-asset/wing-source.glb'))
old = [o for o in bpy.data.objects if o not in before]
extras = [o for o in old if o.type == 'MESH' and o.name in ('wingL', 'wingR', 'eye')]
for o in old:
    if o not in extras:
        bpy.data.objects.remove(o, do_unlink=True)
# Source paint, downscaled for phones. No source archive or full-resolution maps enter the game repo.
folder = Path(tempfile.mkdtemp(prefix='demon-textures-'))
for mat in {m for o in [body, plate] for m in o.data.materials}:
    for node in mat.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or not node.image:
            continue
        image = node.image.copy()
        size = 1024 if 'BaseColor' in image.name else 512
        image.scale(size, size)
        image.filepath_raw = str(folder/(image.name.split('.')[0]+'.png'))
        image.file_format = 'PNG'; image.save(); node.image = bpy.data.images.load(image.filepath_raw, check_existing=False)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    base = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'BaseColor' in n.image.name)
    mat.node_tree.links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
    mat.use_backface_culling = True
bpy.data.objects.remove(rig, do_unlink=True)
# Load the same animation libraries as the angel pipeline; retarget to the same identity-rest 21 bones.
libraries = {key: load(args.libraries, key) for key in ('ual1', 'ual2')}
clips = {'idle': ('ual1', 'Idle_Loop'), 'flight': ('ual2', 'NinjaJump_Idle_Loop'),
         'charge': ('ual1', 'Spell_Simple_Shoot'), 'hit': ('ual1', 'Hit_Chest'), 'down': ('ual1', 'Death01')}
data = {n: sample(libraries[k][0], libraries[k][2][clip], scale) for n, (k, clip) in clips.items()}
bpy.ops.object.select_all(action='DESELECT')
for o in [body, plate, newrig, *extras]: o.select_set(True)
out = ROOT/'public/models/abyssal.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_animations=False,
    export_skins=True, export_yup=True, export_apply=False, export_materials='EXPORT')
glbclips.embed(out, data, NAMES)
report = {'bytes':out.stat().st_size, 'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
          'bodyTriangles':sum(len(p.vertices)-2 for o in [body,plate] for p in o.data.polygons),
          'scale':scale, 'sourceHead':list(head), 'clips':{n:f'{k}/{c}' for n,(k,c) in clips.items()}}
(ROOT/'art/demon-asset/asset.json').write_text(json.dumps(report, indent=2)+'\n')
print('DEMON_ASSET',json.dumps(report))
