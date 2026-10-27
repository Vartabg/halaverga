#!/usr/bin/env python3
"""Builds the Semjaza, Chief of the Watchers GLTF model using headless Blender.
Run via: /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build_semjaza_model.py
"""
import bpy
import math
from pathlib import Path

out_path = Path(__file__).resolve().parents[1] / "public/models/semjaza.glb"
out_path.parent.mkdir(parents=True, exist_ok=True)

# Clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Materials
def create_material(name, base_color, metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

mat_obsidian = create_material("Semjaza_Obsidian", (0.08, 0.06, 0.12), metallic=0.9, roughness=0.2)
mat_bronze = create_material("Semjaza_Bronze", (0.76, 0.58, 0.29), metallic=0.85, roughness=0.35)
mat_feather = create_material("Semjaza_Feather", (0.14, 0.12, 0.20), metallic=0.1, roughness=0.65)
mat_rune = create_material("Semjaza_Rune", (0.65, 0.24, 0.96), metallic=0.0, roughness=0.1, emission=(0.75, 0.30, 1.0), emission_strength=4.8)
mat_staff = create_material("Semjaza_Staff", (0.16, 0.14, 0.18), metallic=0.95, roughness=0.25)
mat_cloth = create_material("Semjaza_Cloth", (0.05, 0.04, 0.08), metallic=0.05, roughness=0.85)

# Root Empty
root = bpy.data.objects.new("Semjaza_Root", None)
bpy.context.collection.objects.link(root)

# 1. Spine / Torso (Obsidian Cuirass, 14m titan scale)
bpy.ops.mesh.primitive_cylinder_add(radius=1.8, depth=5.5, vertices=16, location=(0, 0, 7.5))
torso = bpy.context.active_object
torso.name = "Spine"
torso.scale = (1.2, 0.85, 1.0)
bpy.ops.object.transform_apply(scale=True)
torso.data.materials.append(mat_obsidian)
torso.parent = root

# Chest Plate / Pectoral Inlays
bpy.ops.mesh.primitive_cube_add(size=2.4, location=(0, -0.75, 8.8))
chest = bpy.context.active_object
chest.name = "Cuirass_Plates"
chest.scale = (1.4, 0.5, 1.1)
chest.rotation_euler = (math.radians(-15), 0, 0)
bpy.ops.object.transform_apply(scale=True, rotation=True)
chest.data.materials.append(mat_obsidian)
chest.parent = torso

# Glowing Covenant Inscription Rune on Breastplate
bpy.ops.mesh.primitive_cylinder_add(radius=0.7, depth=0.15, vertices=8, location=(0, -1.2, 8.8))
breast_rune = bpy.context.active_object
breast_rune.name = "Breast_Rune"
breast_rune.rotation_euler = (math.pi / 2, 0, 0)
breast_rune.data.materials.append(mat_rune)
breast_rune.parent = torso

# 2. Mantle & Faulds (Torn Robes)
bpy.ops.mesh.primitive_cone_add(radius1=2.8, radius2=1.6, depth=5.2, vertices=16, location=(0, 0, 3.2))
skirt = bpy.context.active_object
skirt.name = "Mantle"
skirt.scale = (1.25, 0.95, 1.0)
bpy.ops.object.transform_apply(scale=True)
skirt.data.materials.append(mat_cloth)
skirt.parent = torso

# 3. Shoulders (Pauldrons)
for side in [-1, 1]:
    bpy.ops.mesh.primitive_cone_add(radius1=1.4, radius2=0.2, depth=2.8, vertices=8, location=(side * 2.8, 0, 10.2))
    pauldron = bpy.context.active_object
    pauldron.rotation_euler = (0, side * math.radians(70), math.radians(10))
    pauldron.name = f"Pauldron_{'L' if side < 0 else 'R'}"
    pauldron.data.materials.append(mat_obsidian)
    pauldron.parent = torso

    bpy.ops.mesh.primitive_torus_add(major_radius=1.2, minor_radius=0.1, location=(side * 2.4, 0, 9.8))
    p_trim = bpy.context.active_object
    p_trim.name = f"Pauldron_Trim_{side}"
    p_trim.data.materials.append(mat_bronze)
    p_trim.parent = torso

# 4. Head & Horned Obsidian Crown
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.1, segments=16, ring_count=12, location=(0, 0, 11.2))
head = bpy.context.active_object
head.name = "Head"
head.scale = (0.9, 1.1, 1.15)
bpy.ops.object.transform_apply(scale=True)
head.data.materials.append(mat_obsidian)
head.parent = torso

# Crown Base
bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=0.45, vertices=12, location=(0, 0, 12.0))
crown = bpy.context.active_object
crown.name = "Crown"
crown.data.materials.append(mat_bronze)
crown.parent = head

# Jagged Crown Spikes (Horned crown of fallen embers)
for a in range(8):
    angle = a * (2 * math.pi / 8)
    h_x = math.cos(angle) * 1.15
    h_y = math.sin(angle) * 1.15
    spike_h = 1.4 if a % 2 == 0 else 0.9
    bpy.ops.mesh.primitive_cone_add(radius1=0.18, radius2=0.01, depth=spike_h, vertices=6, location=(h_x, h_y, 12.2 + spike_h / 2))
    spike = bpy.context.active_object
    spike.name = f"Crown_Spike_{a}"
    spike.data.materials.append(mat_rune if a % 2 == 0 else mat_obsidian)
    spike.parent = crown

# 5. Six Articulated Seraphic Wings (Wing_L1..3, Wing_R1..3)
wing_specs = [
    (1, 1.8, 10.4, 0.45, 1.3),  # High Upper Wing
    (2, 2.4, 8.8, 0.05, 1.15),  # Mid Spreading Wing
    (3, 2.0, 6.8, -0.40, 0.95), # Low Sweeping Wing
]

for tier, span_x, span_y, angle_tilt, scale_mult in wing_specs:
    for side, prefix in [(-1, 'L'), (1, 'R')]:
        wing_obj = bpy.data.objects.new(f"Wing_{prefix}{tier}", None)
        wing_obj.location = (side * 0.8, 0.9, span_y)
        bpy.context.collection.objects.link(wing_obj)
        wing_obj.parent = torso

        # Primary Wing Scapular Bone
        bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=4.2 * scale_mult, vertices=8, location=(side * 2.2 * scale_mult, 0.2, 0.8))
        bone = bpy.context.active_object
        bone.rotation_euler = (0, side * (math.radians(35) + angle_tilt), 0)
        bone.name = f"WingBone_{prefix}{tier}"
        bone.data.materials.append(mat_obsidian)
        bone.parent = wing_obj

        # Layered Feather Quills (Fan of 6 stylized blades per wing)
        for f in range(6):
            f_offset = f * 0.7 * scale_mult
            bpy.ops.mesh.primitive_cone_add(radius1=0.45, radius2=0.04, depth=3.8 * scale_mult, vertices=6, location=(side * (2.8 * scale_mult + f_offset), 0.1, -f * 0.4))
            feather = bpy.context.active_object
            feather.rotation_euler = (math.radians(10), side * (math.radians(45) + f * 0.12), -side * math.radians(20))
            feather.scale = (1.0, 0.12, 1.0)
            bpy.ops.object.transform_apply(scale=True)
            feather.name = f"Feather_{prefix}{tier}_{f}"
            feather.data.materials.append(mat_rune if f == 0 else mat_feather)
            feather.parent = wing_obj

# 6. Staff of the Fallen Watcher (Hand_R + Staff)
hand_r = bpy.data.objects.new("Hand_R", None)
hand_r.location = (3.2, -1.8, 7.2)
bpy.context.collection.objects.link(hand_r)
hand_r.parent = torso

# Staff Shaft (15m long dark metallic staff)
bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=16.0, vertices=12, location=(0, 0, 1.5))
staff = bpy.context.active_object
staff.name = "Staff"
staff.data.materials.append(mat_staff)
staff.parent = hand_r

# Staff Prongs / Focus Crown
bpy.ops.mesh.primitive_cylinder_add(radius=0.6, depth=0.8, vertices=8, location=(0, 0, 9.2))
staff_top = bpy.context.active_object
staff_top.name = "Staff_Head"
staff_top.data.materials.append(mat_bronze)
staff_top.parent = staff

# Dark Lightning Focus Core
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.55, subdivisions=2, location=(0, 0, 10.0))
focus_gem = bpy.context.active_object
focus_gem.name = "Focus_Gem"
focus_gem.data.materials.append(mat_rune)
focus_gem.parent = staff

# Staff Prongs
for p in range(4):
    p_ang = p * (2 * math.pi / 4)
    bpy.ops.mesh.primitive_cone_add(radius1=0.2, radius2=0.02, depth=2.2, vertices=6, location=(math.cos(p_ang) * 0.65, math.sin(p_ang) * 0.65, 10.5))
    prong = bpy.context.active_object
    prong.rotation_euler = (math.sin(p_ang) * 0.25, -math.cos(p_ang) * 0.25, 0)
    prong.name = f"Staff_Prong_{p}"
    prong.data.materials.append(mat_obsidian)
    prong.parent = staff

# Select all and export
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    use_selection=False,
    export_materials='EXPORT',
    export_apply=True
)
print(f"Exported Semjaza, Chief of the Watchers to: {out_path} ({out_path.stat().st_size / (1024 * 1024):.2f} MB)")
