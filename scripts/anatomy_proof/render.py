"""Fixed cameras and neutral studio light; all images render the saved mesh."""
import bpy
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import ART, DOC, BODY, aim, material, sha, geometry_fingerprint

scene = bpy.context.scene
for obj in list(scene.objects):
    if obj.type in {'CAMERA', 'LIGHT'} or obj.name.startswith('Studio '):
        bpy.data.objects.remove(obj, do_unlink=True)
scene.render.engine = 'CYCLES'
scene.cycles.samples = int(os.environ.get('ANATOMY_SAMPLES', '32'))
scene.cycles.use_denoising = True
scene.render.film_transparent = False
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.38, .38, .38, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.resolution_percentage = 100
for name, pos, power, size in [('Key', (-3, -4, 5), 450, 3), ('Fill', (3, -2, 3), 200, 4), ('Back', (0, 3, 4), 350, 3)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = pos
    aim(obj, (0, 0, 1))
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Studio floor'
floor.location.z = -.006
floor.data.materials.append(material('Studio floor', (.22, .225, .235), .9))
views = {'front': ((0, -8, .95), (0, 0, .95), 2.12, (760, 1120)),
         'side': ((8, 0, .95), (0, 0, .95), 2.12, (760, 1120)),
         'back': ((0, 8, .95), (0, 0, .95), 2.12, (760, 1120)),
         'three-quarter': ((3.5, -7, .95), (0, 0, .95), 2.12, (760, 1120)),
         'torso': ((2, -7, 1.3), (0, 0, 1.3), 1.12, (1000, 1000)),
         'gameplay-scale': ((0, 8, 1.0), (0, 0, 1.0), 9.072, (1440, 1000))}
selected = os.environ.get('ANATOMY_VIEWS', ','.join(views)).split(',')
manifest = {}
bpy.context.view_layer.update()
fingerprint = geometry_fingerprint()
for name in selected:
    position, target, ortho, size = views[name]
    data = bpy.data.cameras.new('Review '+name)
    data.type, data.ortho_scale = 'ORTHO', ortho
    camera = bpy.data.objects.new('Review '+name, data)
    scene.collection.objects.link(camera)
    camera.location = position
    aim(camera, target)
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = str(DOC/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    assert geometry_fingerprint() == fingerprint, 'Geometry changed between views'
    manifest[name] = {'camera': position, 'target': target, 'ortho_scale': ortho, 'size': size,
                      'image_sha256': sha(DOC/(name+'.png')), 'geometry_sha256': fingerprint}
scene.camera = bpy.data.objects.get('Review three-quarter') or scene.camera
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'character.blend'), compress=True)
(DOC/'renders.json').write_text(json.dumps({'blend_sha256': sha(ART/'character.blend'),
    'views': manifest, 'engine': 'Cycles', 'samples': scene.cycles.samples}, indent=2)+'\n')
