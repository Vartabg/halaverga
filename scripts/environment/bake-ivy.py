"""Bake the complete CC0 shrub into a leaf card; retain fine leaf silhouettes."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/tmp/halaverga-environment-sources/shrub_01/shrub_01_1k.gltf')
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in objects:
    for mat in obj.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
        emission = nodes.new('ShaderNodeEmission')
        links.new(bsdf.inputs['Base Color'].links[0].from_socket, emission.inputs['Color'])
        links.new(emission.outputs[0], output.inputs['Surface'])
points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
center = sum(points, Vector()) / len(points)
bpy.ops.object.camera_add(location=(center.x, center.y - 5, center.z))
camera = bpy.context.object
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = max(p.x for p in points) - min(p.x for p in points) + .08
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1024
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(ROOT / 'public/textures/environment/ivy-card.png')
bpy.ops.render.render(write_still=True)
