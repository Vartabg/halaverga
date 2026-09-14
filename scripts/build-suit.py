"""Build the generated-reference explorer and retain an editable Blender source."""
import bpy
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from suit_mesh import material
from hero_anatomy import anatomy
from hero_face import face, hair
from hero_armor import armor
from hero_skin import bind
from hero_color import bake_reference

root = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material('ceramic',(.38,.415,.44),.36,.72)
material('textile',(.031,.039,.045),.78,.06)
material('visor',(.055,.065,.071),.48,.4)
material('energy',(.075,.69,.55),.3,.15,1.25)
material('copper',(.22,.132,.075),.48,.55)
material('skin',(.46,.292,.196),.65)
material('hair',(.027,.023,.021),.72)
material('eyes',(.045,.03,.022),.55)
body = anatomy()
face()
hair()
armor()
# Convert details and apply transforms before binding the authored neutral axes.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = body
bpy.ops.object.convert(target='MESH')
objects = [obj for obj in bpy.context.scene.objects if obj.type=='MESH']
for obj in objects:
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bake_reference(objects,root/'docs/art/explorer-face-reference.png')
rig = bind(objects)
rig['reference'] = 'docs/art/explorer-reference.png'
rig['proportions'] = '1.98m tall; hip .00; knee -.51; shoulder .55; elbow .215'
# Keep the individual plates editable; embed the actual generated reference.
reference = bpy.data.images.load(str(root/'docs/art/explorer-reference.png'))
reference.pack()
ref = bpy.data.objects.new('Generated reference - front side back',None)
bpy.context.collection.objects.link(ref)
ref.empty_display_type = 'IMAGE'; ref.data = reference
ref.empty_display_size = 3.8; ref.location = (2.4,.65,0)
ref.rotation_euler = (1.5707963,0,0); ref.hide_render = True
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene['art_direction'] = 'Reference-led explorer, generated 2026-09-14'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); bpy.context.view_layer.objects.active = body
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 3.4
            area.spaces.active.region_3d.view_location = (0,0,0)
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/halaverga-explorer.blend'),compress=True)
# Runtime: merge by material. Eight primitives, one shared ten-joint skeleton.
for obj in objects: obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.object
body.data.validate(verbose=True); body.data.update()
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); rig.select_set(True)
destination = root/'public/models/suit.glb'
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',
    use_selection=True,export_yup=True,export_extras=True,export_texcoords=True,
    export_normals=True,export_colors=False,export_animations=False)
print('[Explorer] Export →',destination.stat().st_size,'bytes')
