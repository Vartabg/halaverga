"""Run: Blender --background --python scripts/district/build.py"""
import json
import sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
from mesh import initialize, finalize
from architecture import SITES, building
from street import dress_streets
from skyline import skyline

initialize()
for i,site in enumerate(SITES):
    building(site,i)
dress_streets()
skyline()
finalize()
output = Path('/tmp/halaverga-district-raw.glb')
source = ROOT / 'docs/art/blender-district/meridian-district.blend'
report = []
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        report.append({'mesh':obj.name,'triangles':len(obj.data.loop_triangles)})
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',
    export_animations=False,export_cameras=False,export_lights=False,
    export_yup=True,export_colors=True)
(ROOT/'docs/art/blender-district/asset.json').write_text(json.dumps({
    'generator':'Blender '+bpy.app.version_string,'seed':20332113,
    'source':'Original project-authored geometry; no downloaded meshes.',
    'sites':SITES,'triangles':sum(x['triangles'] for x in report),
    'bytes':output.stat().st_size,'meshes':report},indent=2)+'\n')
print('DISTRICT_EXPORTED',output.stat().st_size,sum(x['triangles'] for x in report))
