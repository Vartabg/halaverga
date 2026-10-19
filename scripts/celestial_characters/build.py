"""Reproducible original assets; approved anatomy master and old suit remain untouched.
Run: Blender --background --factory-startup --python scripts/celestial_characters/build.py
"""
import bpy
import sys
import json
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
sys.path.insert(1,str(ROOT/'scripts/athletic_character'))
import hero
import demon

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/parker-anatomy/character.blend'))
sources={key:bpy.data.objects[name] for key,name in {
    'suit':'Undersuit - fitted cloth surface', 'skin':'Anatomy - exposed head hands and feet',
    'eyeL':'GEO-body_male_realistic.eye.L','eyeR':'GEO-body_male_realistic.eye.R'}.items()}
for obj in list(bpy.context.scene.objects):
    if obj not in sources.values():
        bpy.data.objects.remove(obj,do_unlink=True)
for obj in sources.values():
    obj.hide_set(False)
    obj.hide_render=True
    for mod in obj.modifiers:
        if mod.type=='SOLIDIFY':
            mod.show_viewport=False
bpy.context.view_layer.update()
hero_mesh,rig=hero.build(ROOT,sources)
hero_mesh.hide_set(True)
rig.hide_set(True)
demons=demon.build(ROOT,sources)
for obj in sources.values():
    bpy.data.objects.remove(obj,do_unlink=True)
hero_mesh.hide_set(False)
rig.hide_set(False)
folder=ROOT/'art/celestial-characters'
folder.mkdir(exist_ok=True,parents=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'characters.blend'),compress=True)
report={}
for name in ['angel','abyssal']:
    p=ROOT/f'public/models/{name}.glb'
    report[name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
for o in [hero_mesh,*demons]:
    report[o.name]={'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)}
(folder/'asset.json').write_text(json.dumps(report,indent=2)+'\n')
print('CELESTIAL_ASSETS',json.dumps(report))
