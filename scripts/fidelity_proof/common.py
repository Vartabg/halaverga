"""Shared proof paths, reference registration and neutral modeling helpers."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT/'art/fidelity-proof'
DOC = ROOT/'docs/art/fidelity-proof'
REF = json.loads((DOC/'reference.json').read_text())
SCALE = REF['scale']['height_m']/(REF['scale']['sole_y']-REF['scale']['hair_crown_y'])


def pixel(x,y,view='front'):
    return ((x-REF['views'][view]['axis_x'])*SCALE,(941-y)*SCALE)


def smooth(a,b,x):
    t = min(1,max(0,(x-a)/(b-a)))
    return t*t*(3-2*t)


def lerp_table(points,value):
    for (a,u),(b,v) in zip(points,points[1:]):
        if value <= b: return u+(v-u)*max(0,(value-a)/(b-a))
    return points[-1][1]


def clay():
    material = bpy.data.materials.new('Neutral gray clay - no image inputs')
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (.36,.36,.36,1)
    node.inputs['Roughness'].default_value = .72
    material.diffuse_color = (.36,.36,.36,1)
    return material


def mesh(name,vertices,faces,material):
    data = bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    obj = bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for face in obj.data.polygons: face.use_smooth = True
    obj['proof_geometry'] = True
    return obj


def aim(obj,target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
