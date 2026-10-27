#!/usr/bin/env python3
"""Builds the Spear of Dawn GLTF model using headless Blender.
Run via: /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build_spear_model.py
"""
import bpy
import math
from pathlib import Path

out_path = Path(__file__).resolve().parents[1] / "public/models/spear.glb"
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

mat_gold = create_material("Spear_Gold", (0.95, 0.76, 0.28), metallic=0.9, roughness=0.22)
mat_blade = create_material("Spear_Blade", (0.92, 0.94, 0.98), metallic=0.85, roughness=0.18, emission=(0.95, 0.85, 0.5), emission_strength=1.8)
mat_shaft = create_material("Spear_Shaft", (0.18, 0.14, 0.22), metallic=0.5, roughness=0.4)
mat_gem = create_material("Spear_Gem", (1.0, 0.72, 0.2), metallic=0.1, roughness=0.1, emission=(1.0, 0.75, 0.25), emission_strength=4.5)

# Root Empty
root = bpy.data.objects.new("Spear_Root", None)
bpy.context.collection.objects.link(root)

# 1. Shaft (Tapered 2.6m polearm)
bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=2.4, vertices=12, location=(0, 0, 1.2))
shaft = bpy.context.active_object
shaft.name = "Shaft"
shaft.data.materials.append(mat_shaft)
shaft.parent = root

# Shaft Grips / Rings
for z_pos in [0.4, 0.7, 1.5, 1.8]:
    bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.005, location=(0, 0, z_pos))
    ring = bpy.context.active_object
    ring.name = f"Shaft_Ring_{z_pos}"
    ring.data.materials.append(mat_gold)
    ring.parent = root

# 2. Pommel Counterweight
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, segments=12, ring_count=8, location=(0, 0, 0.02))
pommel = bpy.context.active_object
pommel.name = "Pommel"
pommel.data.materials.append(mat_gold)
pommel.parent = root

bpy.ops.mesh.primitive_cone_add(radius1=0.03, radius2=0.002, depth=0.12, vertices=8, location=(0, 0, -0.06))
pommel_spike = bpy.context.active_object
pommel_spike.rotation_euler = (math.pi, 0, 0)
pommel_spike.name = "Pommel_Spike"
pommel_spike.data.materials.append(mat_blade)
pommel_spike.parent = root

# 3. Sun Crossguard
bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.035, vertices=16, location=(0, 0, 2.38))
sun_disk = bpy.context.active_object
sun_disk.rotation_euler = (math.pi / 2, 0, 0)
sun_disk.name = "Sun_Disk"
sun_disk.data.materials.append(mat_gold)
sun_disk.parent = root

# Crossguard Wing Quillons
for side in [-1, 1]:
    bpy.ops.mesh.primitive_cone_add(radius1=0.035, radius2=0.005, depth=0.28, vertices=8, location=(side * 0.14, 0, 2.42))
    quillon = bpy.context.active_object
    quillon.rotation_euler = (0, side * math.radians(65), 0)
    quillon.name = f"Quillon_{side}"
    quillon.data.materials.append(mat_gold)
    quillon.parent = root

# Central Solar Gem Focus
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.032, subdivisions=2, location=(0, 0, 2.38))
gem = bpy.context.active_object
gem.name = "Solar_Gem"
gem.data.materials.append(mat_gem)
gem.parent = root

# 4. Spear Blade (Leaf-shaped double-edged blade, 0.85m long)
bpy.ops.mesh.primitive_cone_add(radius1=0.072, radius2=0.001, depth=0.82, vertices=8, location=(0, 0, 2.82))
blade = bpy.context.active_object
blade.name = "Blade"
blade.scale = (1.0, 0.16, 1.0)
bpy.ops.object.transform_apply(scale=True)
blade.data.materials.append(mat_blade)
blade.parent = root

# Blade Fuller / Core Glow
bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.65, vertices=6, location=(0, 0, 2.74))
core = bpy.context.active_object
core.name = "Blade_Core"
core.data.materials.append(mat_gem)
core.parent = root

# Select all and export
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=str(out_path),
    export_format='GLB',
    use_selection=False,
    export_materials='EXPORT',
    export_apply=True
)
print(f"Exported Spear of Dawn to: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")
