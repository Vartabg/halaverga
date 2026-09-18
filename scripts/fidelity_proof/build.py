"""Build the offline proof; never export or alter the playable asset."""
import argparse
import bpy
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from common import ROOT, ART, DOC, REF, clay
from fit import reshape
from armor import build_armor
from hair import build_hair
from evidence import BUNDLE_SHA256, topology_hash, aligned_references

parser = argparse.ArgumentParser()
parser.add_argument('--bundle',required=True)
parser.add_argument('--revision',type=int,choices=[0,1,2],default=0)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
assert hashlib.sha256(Path(args.bundle).read_bytes()).hexdigest()==BUNDLE_SHA256, 'Unexpected source bundle.'
ART.mkdir(parents=True,exist_ok=True); DOC.mkdir(parents=True,exist_ok=True)
reference = ROOT/REF['image']
assert hashlib.sha256(reference.read_bytes()).hexdigest() == REF['sha256']
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
names = ['GEO-body_male_realistic','GEO-body_male_realistic.eye.L','GEO-body_male_realistic.eye.R']
with bpy.data.libraries.load(args.bundle,link=False) as (source,target):
    assert all(name in source.objects for name in names), 'The expected Studio realistic male is missing.'
    target.objects = names[:]
for obj in target.objects: bpy.context.collection.objects.link(obj)
bpy.context.view_layer.update()
body = bpy.data.objects[names[0]]
source_topology = topology_hash(body.data)
origin = body.matrix_world.translation.copy()
eyes = [(bpy.data.objects[name],bpy.data.objects[name].matrix_world.translation-origin) for name in names[1:]]
material = clay()
for obj in target.objects:
    obj.animation_data_clear()
    for key in list(obj.keys()): del obj[key]
    obj.data.materials.clear(); obj.data.materials.append(material)
    for p in obj.data.polygons: p.use_smooth = True
body.location = (0,0,0)
reshape(body,eyes,args.revision)
body.name = 'Studio anatomy - reference fit'
body['source_asset'] = 'Body Male - Realistic / Dan Ulrich / Blender Studio bundle v1.1 / CC0'
for modifier in body.modifiers:
    if modifier.type == 'MULTIRES': modifier.levels = 2; modifier.render_levels = 2
bpy.context.view_layer.update()
tailor = build_armor(body,material,args.revision)
build_hair(tailor,material,body,args.revision)
image = bpy.data.images.load(str(reference)); image.pack(); image.use_fake_user = True
refs = bpy.data.collections.new('REFERENCE - original concept, not render geometry')
bpy.context.scene.collection.children.link(refs)
empty = bpy.data.objects.new('Locked original concept - all views',None)
refs.objects.link(empty); empty.empty_display_type = 'IMAGE'; empty.data = image
empty.empty_display_size = 3.32; empty.location = (2.2,.6,1)
empty.rotation_euler = (1.5707963,0,0); empty.hide_render = True
aligned_references(image,refs)
text = bpy.data.texts.new('PROVENANCE AND PROOF LIMITS')
text.write('Body Male - Realistic by Dan Ulrich. Blender Studio Human Base Meshes v1.1.0. CC0.\n'
           'The bundled README says all provided assets are CC0 and require Blender 3.2+.\n'
           'The unrelated Rain Rig License text is not imported; no rig is part of this proof.\n'
           'Original topology and Multires retained; proportions changed with an editable shape key.\n'
           'No image textures, AI-enhanced output, rig or game export. Human visual review is pending.\n')
scene = bpy.context.scene
scene['proof_revision'] = args.revision
scene['reference_sha256'] = REF['sha256']
scene['source_blend_sha256'] = BUNDLE_SHA256
scene['source_topology_sha256'] = source_topology
scene.unit_settings.system = 'METRIC'
scene['runtime_hashes'] = json.dumps({p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['public/models/suit.glb','src/world/suitGeometry.ts']})
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
bpy.context.view_layer.objects.active = body
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 3
            area.spaces.active.region_3d.view_location = (0,0,1)
            area.spaces.active.shading.type = 'SOLID'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'character.blend'),compress=True)
print('[Proof] Editable mesh → saved, revision',args.revision)
