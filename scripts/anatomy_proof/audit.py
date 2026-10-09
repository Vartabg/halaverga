"""Read a saved proof and audit provenance/geometry; no aesthetic score."""
import bpy
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, ART, DOC, SOURCE, BODY, topology, sha

scene = bpy.context.scene
body = bpy.data.objects[BODY]
graph = bpy.context.evaluated_depsgraph_get()
points = [body.matrix_world@v.co for v in body.evaluated_get(graph).data.vertices]
assert all(math.isfinite(n) for p in points for n in p)
assert len(body.data.vertices) == 10582
assert len(body.data.polygons) == 10590
assert topology(body.data) == body['source_topology_sha256']
assert sha(SOURCE) == scene['source_file_sha256']
with bpy.data.libraries.load(str(SOURCE), link=False) as (source, target):
    target.objects = ['Studio anatomy - reference fit']
original = target.objects[0]
assert topology(original.data) == topology(body.data)
assert all((a.co-b.co).length < 1e-8 for a, b in zip(
    original.data.shape_keys.key_blocks['Basis'].data, body.data.shape_keys.key_blocks['Basis'].data))
bpy.data.objects.remove(original, do_unlink=True)
runtime = json.loads(scene['runtime_hashes'])
assert all(sha(ROOT/p) == value for p, value in runtime.items()), 'Runtime changed during proof'
assert not any(o.type == 'ARMATURE' for o in scene.objects)
visible = [o for o in scene.objects if o.type == 'MESH' and not o.hide_render and o.name != 'Studio floor']
assert not any(n.type == 'TEX_IMAGE' for o in visible for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes)
for obj in visible:
    evaluated = obj.evaluated_get(graph)
    assert all(math.isfinite(n) for v in evaluated.data.vertices for n in v.co)
    assert len(evaluated.data.polygons) > 0


def width(z, half_band, max_x):
    selected = [p.x for p in points if abs(p.z-z) < half_band and abs(p.x) < max_x]
    return round(max(selected)-min(selected), 4)


height = max(p.z for p in points)-min(p.z for p in points)
report = {'blender': bpy.app.version_string, 'saved_file_reopened': True,
          'blend_sha256': sha(ART/'character.blend'), 'source_file_sha256': sha(SOURCE),
          'base': 'Blender Studio / Body Male - Realistic / Dan Ulrich / CC0',
          'source_topology_sha256': topology(body.data),
          'master_vertices': len(body.data.vertices), 'master_polygons': len(body.data.polygons),
          'shape_keys': {k.name: k.value for k in body.data.shape_keys.key_blocks},
          'measurements_m': {'height': round(height, 4),
              'shoulder_envelope_at_1_47m': width(1.47, .018, .4),
              'waist_at_1_20m_excluding_arms': width(1.2, .012, .21),
              'hip_at_0_96m_excluding_hands': width(.96, .012, .23)},
          'visible_meshes': [o.name for o in visible],
          'no_armature': True, 'no_image_materials': True, 'runtime_unchanged': True,
          'runtime_hashes': runtime, 'visual_acceptance': 'Pending owner review',
          'scope': 'Offline anatomy proof; no production character or device-performance claim'}
(DOC/'audit.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({k: report[k] for k in ['saved_file_reopened', 'measurements_m', 'runtime_unchanged', 'visual_acceptance']}))
