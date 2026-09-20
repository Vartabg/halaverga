"""Blender derivative of CC0 sources. Run fetch-assets.py first."""
import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from leaf_lod import canopy_lod
CACHE = Path('/tmp/halaverga-environment-sources')
OUT = ROOT / 'public/models/environment'
OUT.mkdir(parents=True, exist_ok=True)
report = []
for name, budgets in [('island_tree_01', [2200, 11000, 1800])]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(CACHE / name / (name + '_1k.gltf')))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL')
        bpy.ops.object.mode_set(mode='OBJECT')
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        mat = obj.data.materials[obj.data.polygons[0].material_index]
        index = 1 if 'leaves' in mat.name else 2 if 'branches' in mat.name else 0
        budget = budgets[min(index, len(budgets) - 1)]
        leaf_lod = canopy_lod(obj, 7200, 2.15) if 'leaves' in mat.name else False
        if not leaf_lod:
            obj.data.calc_loop_triangles()
            mod = obj.modifiers.new('Browser budget', 'DECIMATE')
            mod.ratio = min(1, budget / len(obj.data.loop_triangles))
            bpy.ops.object.modifier_apply(modifier=mod.name)
        # Opaque geometric leaves avoid sorting and dense transparent overdraw.
        nodes = mat.node_tree.nodes
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        for socket in ['Normal', 'Roughness', 'Metallic', 'Alpha']:
            for link in list(bsdf.inputs[socket].links):
                mat.node_tree.links.remove(link)
        bsdf.inputs['Alpha'].default_value = 1
        bsdf.inputs['Roughness'].default_value = .88
        bsdf.inputs['Metallic'].default_value = 0
        for node in nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                node.image.scale(512, 512)
        obj.data.calc_loop_triangles()
        report.append({'asset': name, 'mesh': obj.name, 'material': mat.name,
                       'wholeLeafLOD': leaf_lod, 'triangles': len(obj.data.loop_triangles)})
    # Export meters, grounded at z=0 in Blender (y=0 in glTF).
    points = [o.matrix_world @ Vector(p) for o in objects for p in o.bound_box]
    center = Vector(((min(p.x for p in points) + max(p.x for p in points)) / 2,
                     (min(p.y for p in points) + max(p.y for p in points)) / 2,
                     min(p.z for p in points)))
    height = max(p.z for p in points) - center.z
    for obj in objects:
        obj.location -= center
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB',
                              export_image_format='JPEG', export_jpeg_quality=82,
                              export_animations=False, export_cameras=False, export_lights=False)
    report.append({'asset': name, 'heightMeters': height})
(ROOT / 'docs/art/reclaimed-boulevard/asset-processing.json').write_text(json.dumps(report, indent=2) + '\n')
