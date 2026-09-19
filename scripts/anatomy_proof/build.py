"""Make a new editable anatomy proof; never modify the original or game asset."""
import bpy
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, ART, DOC, SOURCE, BODY, material, topology, sha
from fit import athletic, garment
from garment import build_garment

ART.mkdir(parents=True, exist_ok=True)
DOC.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
names = ['Studio anatomy - reference fit', 'GEO-body_male_realistic.eye.L', 'GEO-body_male_realistic.eye.R']
with bpy.data.libraries.load(str(SOURCE), link=False) as (source, target):
    target.objects = names
for obj in target.objects:
    bpy.context.collection.objects.link(obj)
body = target.objects[0]
body.name = BODY
body.animation_data_clear()
basis = body.data.shape_keys.key_blocks['Basis']
for key in body.data.shape_keys.key_blocks:
    key.value = 0
# Keep the source Basis and symmetry; remove the previous failed fit from this copy.
for key in list(body.data.shape_keys.key_blocks)[2:]:
    body.shape_key_remove(key)
form = body.shape_key_add(name='Athletic adult - proportions and volume')
cloth = body.shape_key_add(name='Undersuit - smooth fitted envelope')
cloth.relative_key = form
for original, shaped, covered in zip(basis.data, form.data, cloth.data):
    shaped.co = athletic(original.co)
    covered.co = garment(original.co, shaped.co)
form.value = 1
cloth.value = 1
fabric = material('Plain graphite undersuit', (.19, .225, .25), .74)
skin = material('Neutral head and hand study', (.38, .32, .275), .65)
eye = material('Neutral eye study', (.26, .255, .235), .5)
body.data.materials.clear()
body.data.materials.append(fabric)
body.data.materials.append(skin)
for polygon in body.data.polygons:
    points = [basis.data[i].co for i in polygon.vertices]
    head = min(p.y for p in points) > 1.426
    hand = min(abs(p.x) for p in points) > .363 and max(p.y for p in points) < .965
    polygon.material_index = 1 if head or hand else 0
    polygon.use_smooth = True
for mod in body.modifiers:
    if mod.type == 'MULTIRES':
        mod.levels = 2
        mod.render_levels = 3
# Recover source eye centres from the previous monotone reference fit.
for obj in target.objects[1:]:
    prior = obj.location.copy()
    sy = 1.58+(prior.z-1.864)*(1.68436-1.58)/(1.97-1.864)
    sx = prior.x/1.2
    sd = (-prior.y+.024)/1.12
    centre = athletic((sx, sy, sd))
    obj.location = (centre.x, -centre.z, centre.y)
    obj.scale *= 1.055/1.17
    obj.data.materials.clear()
    obj.data.materials.append(eye)
body['source_asset'] = 'Body Male - Realistic / Dan Ulrich / Blender Studio / CC0'
body['source_topology_sha256'] = topology(body.data)
body['scope'] = 'Anatomy proof; unrigged; physique reference, not Peter Parker likeness'
cloth_surface, exposed = build_garment(body)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene['source_file_sha256'] = sha(SOURCE)
scene['runtime_hashes'] = json.dumps({str(p.relative_to(ROOT)): sha(p)
    for p in sorted((ROOT/'src').rglob('*')) if p.is_file()} | {'public/models/suit.glb': sha(ROOT/'public/models/suit.glb')})
scene['visual_status'] = 'Anatomy study - pending user review'
scene['reference_url'] = 'https://insight.randomhouse.com/fullpage.do?pContentType=JPG&pISBN=9781506743004&pName=fullpage&pPageID=20'
text = bpy.data.texts.new('READ ME - anatomy proof')
text.write('Halaverga athletic adult anatomy proof.\nBase anatomy: Body Male - Realistic, Dan Ulrich, Blender Studio CC0.\n'
           'Original Basis and Multires retained; separate anatomy and garment shape keys.\n'
           'Peter Parker physique is a visual direction only; no game meshes or costume were copied.\n'
           'Unrigged. No final face, hair, armor, textures, animation or game replacement.\n')
bpy.ops.object.select_all(action='DESELECT')
cloth_surface.select_set(True)
bpy.context.view_layer.objects.active = cloth_surface
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 3.2
            area.spaces.active.region_3d.view_location = (0, 0, .95)
            area.spaces.active.shading.type = 'MATERIAL'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'character.blend'), compress=True)
print('[Anatomy] Saved editable proof with source topology', topology(body.data))
