"""Join the posed pack meshes into one angel bound to the game's 21-bone skeleton.

Game frame (Blender side of the export): pelvis at the origin, Z up, the character faces +Y and its left side is -X; the glTF
export turns that into three.js metres facing -Z. Bones rest at identity with their tails along +Z, like the old rig
(scripts/athletic_character/rig.py), so buildSkinnedSuit binds the GLB unchanged.
"""
from math import pi
from mathutils import Matrix, Vector
import bmesh
import bpy

NAMES = ['pelvis', 'head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'forearm_l', 'forearm_r', 'shin_l', 'shin_r',
         'spine', 'chest', 'neck', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r']
PARENTS = [-1, 12, 13, 14, 0, 0, 2, 3, 4, 5, 0, 10, 11, 11, 11, 6, 7, 8, 9, 17, 18]
# Source bone whose head places each game bone. The game's chest (wing root) sits where the old one did, at spine_03.
HEADS = {'pelvis': 'pelvis', 'spine': 'spine_01', 'chest': 'spine_03', 'neck': 'neck_01', 'head': 'Head'}
for s in 'lr':
    HEADS.update({f'clavicle_{s}': f'clavicle_{s}', f'upperarm_{s}': f'upperarm_{s}', f'forearm_{s}': f'lowerarm_{s}',
                  f'hand_{s}': f'hand_{s}', f'thigh_{s}': f'thigh_{s}', f'shin_{s}': f'calf_{s}', f'foot_{s}': f'foot_{s}',
                  f'toe_{s}': f'ball_{s}'})
# Pelvis to boot sole of the current angel (public/models/angel.glb), so feet, camera and physics keep their heights.
PELVIS_HEIGHT = 1.056


def game_bone(source):
    """Weights of one source bone go to this game bone; the 30 finger bones fold into the hand."""
    if source in ('root', 'pelvis'):
        return 'pelvis'
    if source in ('spine_01', 'spine_02'):
        return 'spine'
    if source.startswith(('index', 'middle', 'ring', 'pinky', 'thumb')):
        return 'hand_' + source[-1]
    if source.startswith('ball'):
        return 'toe_' + source[-1]
    inverse = {v: k for k, v in HEADS.items()}
    return inverse.get(source)


def placement(rig, sole):
    """Source frame to game frame: turn to face +Y, scale the pelvis height to the old angel's, pelvis to the origin."""
    pelvis = rig.matrix_world @ rig.pose.bones['pelvis'].head
    scale = PELVIS_HEIGHT/(pelvis.z-sole)
    return Matrix.Rotation(pi, 4, 'Z') @ Matrix.Scale(scale, 4) @ Matrix.Translation(-pelvis), scale


def head_only(obj, neck=1.44, neck_half=.115, v_bottom=1.33, v_half=.07, inset=.015):
    """The outfits replace the body: keep the head, the neck and the strip of chest the tunic's V collar shows (posed source
    frame). Below the collar line the kept skin sinks so the superhero chest cannot poke through the regular-body tunic."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    keep = lambda v: (v.co.z > neck and abs(v.co.x) < neck_half) or (v.co.z > v_bottom and abs(v.co.x) < v_half)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep(v) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        if v.co.z < neck+.06:
            v.co -= v.normal*inset*min(1, (neck+.06-v.co.z)/.05)
    bm.to_mesh(obj.data)
    bm.free()


def mirrored(obj, name):
    """A left-right copy (source frame mirrors x), its weights moved to the opposite side's bones."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    bpy.context.scene.collection.objects.link(copy)
    copy.data.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
    copy.data.flip_normals()
    for g in copy.vertex_groups:
        if g.name.endswith(('_l', '_r')):
            g.name = g.name[:-1]+('r' if g.name.endswith('_l') else 'l')+'~'
    for g in copy.vertex_groups:
        g.name = g.name.rstrip('~')
    return copy


def decimate(obj, triangles):
    count = sum(len(p.vertices)-2 for p in obj.data.polygons)
    if count <= triangles:
        return
    mod = obj.modifiers.new('Phone budget', 'DECIMATE')
    mod.ratio = triangles/count
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def single_uv(obj):
    """Each pack mesh names its UV map differently; joined, they would export four UV sets per vertex."""
    uv = obj.data.uv_layers
    keep = uv.active.name
    for name in [layer.name for layer in uv if layer.name != keep]:
        uv.remove(uv[name])
    uv[keep].name = 'UVMap'


def reweight(obj):
    """Sum the source groups into the 21 game groups, keep the four strongest per vertex, normalise."""
    sources = {g.index: game_bone(g.name) for g in obj.vertex_groups}
    rows = []
    for v in obj.data.vertices:
        acc = {}
        for g in v.groups:
            target = sources.get(g.group)
            if target and g.weight > 0:
                acc[target] = acc.get(target, 0)+g.weight
        best = sorted(acc.items(), key=lambda p: -p[1])[:4]
        total = sum(w for _, w in best) or 1
        rows.append([(n, w/total) for n, w in best] or [('pelvis', 1)])
    obj.vertex_groups.clear()
    groups = {n: obj.vertex_groups.new(name=n) for n in NAMES}
    for i, row in enumerate(rows):
        for n, w in row:
            groups[n].add([i], w, 'REPLACE')


def build_rig(source, place):
    """The game skeleton, its heads taken from the posed outfit armature."""
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'Angel flight rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    bones = []
    for name in NAMES:
        b = rig.data.edit_bones.new(name)
        b.head = place @ (source.matrix_world @ source.pose.bones[HEADS[name]].head)
        b.tail = b.head+Vector((0, 0, .08))
        bones.append(b)
    for i, parent in enumerate(PARENTS):
        if parent >= 0:
            bones[i].parent = bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def share_materials(objects):
    """One material per source name (the outfits import their own copies), so each draws as one batch."""
    first = {}
    for o in objects:
        for slot in o.material_slots:
            key = slot.material.name.split('.')[0]
            slot.material = first.setdefault(key, slot.material)
    return list(first.values())


def join(objects, rig, place):
    for o in objects:
        o.data.transform(place)
        # The packs' vertex colours are colour-variant masks for their own shaders; three.js would multiply them in.
        for name in [a.name for a in o.data.color_attributes]:
            o.data.color_attributes.remove(o.data.color_attributes[name])
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    angel = bpy.context.object
    angel.name = 'Angel'
    angel.parent = rig
    angel.modifiers.new('Flight skin', 'ARMATURE').object = rig
    return angel
