"""Paths and studio utilities for the isolated anatomy proof."""
from pathlib import Path
import hashlib
from array import array
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/parker-anatomy'
DOC = ROOT / 'docs/art/parker-anatomy'
SOURCE = ROOT / 'art/fidelity-proof/character.blend'
BODY = 'Explorer - anatomical undersuit'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def smooth(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)


def material(name, color, roughness=.65):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*color, 1)
    bsdf = result.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return result


def aim(obj, point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z', 'Y').to_euler()


def topology(mesh):
    digest = hashlib.sha256()
    for face in mesh.polygons:
        digest.update(','.join(map(str, face.vertices)).encode()+b';')
    return digest.hexdigest()


def geometry_fingerprint():
    digest = hashlib.sha256()
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if obj.type != 'MESH' or obj.hide_render or obj.name == 'Studio floor':
            continue
        mesh = obj.evaluated_get(graph).data
        positions = array('f', [0])*(3*len(mesh.vertices))
        mesh.vertices.foreach_get('co', positions)
        digest.update(obj.name.encode())
        digest.update(str(list(obj.matrix_world)).encode())
        digest.update(positions.tobytes())
    return digest.hexdigest()
