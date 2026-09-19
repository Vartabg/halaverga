"""Export the approved anatomy as the actual playable character, with no source edits."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from rig import bind, NAMES, POINTS, rest

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT/'art/athletic-character'
DOC = ROOT/'docs/art/athletic-character'
PROOF = ROOT/'art/parker-anatomy/character.blend'
SOURCE = PROOF if PROOF.exists() else ART/'character.blend'
ART.mkdir(parents=True, exist_ok=True)
DOC.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
approved_sha = sha(PROOF) if SOURCE == PROOF else bpy.context.scene['source_anatomy_sha256']
names = {'Undersuit - fitted cloth surface': ('Explorer undersuit', 'textile', 28000),
         'Anatomy - exposed head hands and feet': ('Explorer anatomy', 'skin', 12000),
         'GEO-body_male_realistic.eye.L': ('Explorer eye L', 'eyes', 600),
         'GEO-body_male_realistic.eye.R': ('Explorer eye R', 'eyes', 600)}
source_objects = [bpy.data.objects[name] for name in names]+[bpy.data.objects['Explorer - anatomical undersuit']]
for obj in list(bpy.context.scene.objects):
    if obj not in source_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
for collection in [bpy.data.meshes, bpy.data.materials]:
    for data in list(collection):
        if data.users == 0:
            collection.remove(data)
objects = []
for name, (label, finish, target) in names.items():
    original = bpy.data.objects[name]
    original.hide_set(False)
    # The rendered proof has a double-sided solid shell. Runtime needs its outer
    # surface only; removing the invisible inside spends triangles on anatomy.
    for mod in original.modifiers:
        if mod.type == 'SOLIDIFY':
            mod.show_viewport = False
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(original.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mesh.transform(original.matrix_world)
    obj = bpy.data.objects.new(label, mesh)
    bpy.context.scene.collection.objects.link(obj)
    material = original.data.materials[0].copy()
    material.name = finish
    material.diffuse_color[3] = 1
    mesh.materials.clear()
    mesh.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Keep the authored smooth forms; the neutral surface has no displacement map.
    tris = sum(len(p.vertices)-2 for p in mesh.polygons)
    decimate = obj.modifiers.new('Runtime silhouette budget', 'DECIMATE')
    decimate.ratio = min(1, target/tris)
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    obj.data.name = label+' mesh'
    for p in obj.data.polygons:
        p.use_smooth = True
    objects.append(obj)
# Keep the approved master, shape keys, and original derived surfaces in this
# deliverable so the runtime asset can be rebuilt without another worktree.
for obj in source_objects:
    obj.hide_render = True
    obj.hide_set(True)
# Eyes use one batch and remain rigid under the head, including their original UVs.
bpy.ops.object.select_all(action='DESELECT')
for obj in objects[2:]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[2]
bpy.ops.object.join()
eyes = bpy.context.object
eyes.name = 'Explorer eyes'
eyes.data.name = 'Explorer eyes mesh'
eyes.data.materials.clear()
eyes.data.materials.append(bpy.data.materials['eyes'])
for p in eyes.data.polygons:
    p.material_index = 0
objects = objects[:2]+[eyes]
rig = bind(objects)
bpy.context.scene['source_anatomy_sha256'] = approved_sha
bpy.context.scene['scope'] = 'Approved athletic anatomy integrated with neutral undersuit and flight rig; face/hair/detail pending'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'character.blend'), compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects+[rig]:
    obj.select_set(True)
target = ROOT/'public/models/suit.glb'
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
    export_animations=False, export_skins=True, export_yup=True, export_apply=False,
    export_materials='EXPORT', export_extras=True, export_texcoords=True, export_normals=True)
report = {'source': 'Approved source surfaces retained in art/athletic-character/character.blend',
          'source_sha256': approved_sha,
          'asset_sha256': sha(target), 'bytes': target.stat().st_size,
          'bind': '21 original names/parents; identity rotations; anatomy-fitted joint positions',
          'changes': 'Uniform 1.98/1.85 scale; arms lowered 14 degrees; leg splay closed 6 degrees; body volume retained; outer cloth surface only',
          'meshes': [{'name': o.name, 'vertices': len(o.data.vertices),
                      'triangles': sum(len(p.vertices)-2 for p in o.data.polygons)} for o in objects]}
(DOC/'asset.json').write_text(json.dumps(report, indent=2)+'\n')
print('[Athletic export]', json.dumps(report))
