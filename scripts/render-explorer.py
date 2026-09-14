"""Render the exported game asset in Blender for a faithful three-view review."""
import bpy
from math import pi
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/suit.glb'))
original = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE'
            or any(mod.type == 'ARMATURE' for mod in obj.modifiers)]
for obj in bpy.context.scene.objects:
    if obj not in original: obj.hide_render = True
for view, offset, angle in [('Front',1.22,0),('Profile',0,pi/2),('Back',-1.22,pi)]:
    container = bpy.data.objects.new(view,None)
    bpy.context.collection.objects.link(container)
    copies = {}
    for obj in original:
        clone = obj.copy()
        if obj.data: clone.data = obj.data.copy()
        bpy.context.collection.objects.link(clone)
        copies[obj] = clone
    for source,clone in copies.items():
        clone.parent = copies.get(source.parent,container)
        for modifier in clone.modifiers:
            if modifier.type == 'ARMATURE': modifier.object = copies[modifier.object]
    container.location.x = offset
    container.rotation_euler.z = angle
for obj in original: bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-1.012))
ground = bpy.context.object
mat = bpy.data.materials.new('Studio floor'); mat.diffuse_color = (.105,.13,.15,1)
ground.data.materials.append(mat)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.world.color = (.22,.22,.22)
def aim(obj,point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,location,power,size,color in [
    ('Key',(-3,4,4),480,4,(1,.94,.85)),('Fill',(3,3,1),350,3,(.78,.87,1)),
    ('Rim',(1,-3,3),600,3,(.78,.92,1))]:
    data = bpy.data.lights.new(name,'AREA'); data.energy = power
    data.shape = 'DISK'; data.size = size; data.color = color
    obj = bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.location = location; aim(obj,(0,0,0))
bpy.ops.object.camera_add(location=(0,8,1.05))
camera = bpy.context.object; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 4.1
aim(camera,(0,0,-.01)); scene.camera = camera
scene.render.resolution_x = 1640; scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(root/'docs/images/reference-hero-blender.png')
bpy.ops.render.render(write_still=True)
camera.location = (1.65,2,.98); aim(camera,(1.22,0,.825))
camera.data.ortho_scale = .47
scene.render.resolution_x = 1000; scene.render.resolution_y = 1000
scene.render.filepath = str(root/'docs/images/reference-hero-face.png')
bpy.ops.render.render(write_still=True)
