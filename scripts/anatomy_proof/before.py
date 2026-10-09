"""Render the unchanged playable GLB with the proof's camera and lighting."""
import bpy
import json
from math import pi
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, DOC, sha

scene = bpy.context.scene
for obj in list(scene.objects):
    if obj.type == 'MESH' and obj.name != 'Studio floor':
        obj.hide_render = True
old_objects = set(scene.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/suit.glb'))
added = set(scene.objects)-old_objects
bpy.context.view_layer.update()
graph = bpy.context.evaluated_depsgraph_get()
points = [obj.matrix_world@v.co for obj in added if obj.type == 'MESH'
          for v in obj.evaluated_get(graph).data.vertices]
bottom, top = min(p.z for p in points), max(p.z for p in points)
root = bpy.data.objects.new('Comparison normalization', None)
scene.collection.objects.link(root)
for obj in added:
    if obj.parent not in added:
        obj.parent = root
scale = 1.85/(top-bottom)
root.scale = (scale,)*3
root.rotation_euler.z = pi  # The game export faces +Y; the anatomy study faces -Y.
root.location.z = -bottom*scale
scene.camera = bpy.data.objects['Review front']
scene.render.resolution_x, scene.render.resolution_y = 760, 1120
scene.render.filepath = str(DOC/'previous-front.png')
bpy.ops.render.render(write_still=True)
(DOC/'comparison.json').write_text(json.dumps({
    'source': 'public/models/suit.glb', 'source_sha256': sha(ROOT/'public/models/suit.glb'),
    'image_sha256': sha(DOC/'previous-front.png'), 'height_normalized_to_m': 1.85,
    'scale': scale, 'facing_rotation_z_radians': pi, 'lighting_and_camera': 'same as anatomy front',
    'note': 'Current textured game asset vs untextured anatomy study; materials differ.'}, indent=2)+'\n')
