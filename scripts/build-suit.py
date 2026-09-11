"""Generate the original Halaverga suit as a small, untextured GLB. Run with Blender."""
import bpy
from pathlib import Path
from math import radians

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}
for name, color in {'ceramic': (.66,.69,.63,1), 'chalk': (.82,.82,.72,1),
                    'joint': (.055,.095,.12,1), 'visor': (.035,.10,.13,1),
                    'copper': (.60,.27,.13,1), 'light': (.5,.95,.72,1)}.items():
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = .48
    materials[name] = mat

def part(name, pos, size, material, bevel=.04, rotate=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler[1] = radians(rotate)
    if bevel:
        modifier = obj.modifiers.new('Manufactured edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(materials[material])
    return obj

# Blender +Y is the travel direction; glTF export converts Z-up to Y-up.
part('Thorax', (0,0,.23), (.58,.35,.66), 'ceramic', .11)
part('Chest plate', (0,.2,.30), (.43,.09,.32), 'chalk', .055)
part('Heartlight', (0,.252,.30), (.09,.015,.19), 'light', .02)
part('Pelvic frame', (0,0,-.18), (.47,.30,.22), 'joint', .06)
part('Collar', (0,0,.60), (.31,.3,.10), 'joint', .035)
part('Helmet', (0,0,.81), (.42,.42,.43), 'chalk', .14)
part('Visor', (0,.197,.83), (.36,.10,.18), 'visor', .065)
part('Visor rim', (0,.24,.94), (.30,.025,.025), 'copper', .01)
part('Life core', (0,-.25,.22), (.40,.24,.60), 'joint', .06)
part('Rear core strip', (0,-.38,.22), (.11,.035,.33), 'light', .02)
for s in [-1,1]:
    part('Shoulder', (s*.36,0,.44), (.25,.31,.24), 'copper', .075)
    part('Upper arm', (s*.4,0,.23), (.18,.23,.31), 'ceramic', .055, s*8)
    part('Elbow', (s*.43,0,.03), (.14,.18,.16), 'joint', .055)
    part('Forearm', (s*.45,.02,-.12), (.18,.22,.25), 'chalk', .05)
    part('Hand', (s*.46,.025,-.30), (.13,.20,.17), 'joint', .045)
    part('Thigh', (s*.145,0,-.40), (.22,.26,.34), 'ceramic', .065)
    part('Knee', (s*.145,.03,-.62), (.20,.27,.14), 'joint', .035)
    part('Shin', (s*.145,-.01,-.79), (.18,.23,.26), 'chalk', .045)
    part('Boot', (s*.145,.06,-.96), (.22,.36,.15), 'joint', .035)
    part('Shin light', (s*.145,.12,-.78), (.045,.02,.15), 'light', .008)

destination = Path(__file__).resolve().parents[1] / 'public' / 'models' / 'suit.glb'
destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_yup=True)
print('Exported', destination)
