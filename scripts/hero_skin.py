"""Deterministic smooth weights and ten neutral-axis animation controls."""
import bpy
from mathutils import Vector

PIVOTS = [(0,0,0),(0,0,.61),(-.286,0,.47),(.286,0,.47),
          (-.119,0,-.22),(.119,0,-.22),(-.325,0,.041),(.325,0,.041),
          (-.119,0,-.613),(.119,0,-.613)]
PARENTS = [-1,0,0,0,0,0,2,3,4,5]


def smooth(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)


def weights(point):
    x, _, z = point
    side = 0 if x < 0 else 1
    head = smooth(.555,.695,z)
    arm = smooth(.205,.295,abs(x)) * (1-smooth(.48,.59,z))
    # At hip height hands remain outside the legs' weighting region.
    leg = (1-smooth(-.29,-.135,z)) * (1-smooth(.22,.28,abs(x)))
    elbow = 1-smooth(-.03,.105,z)
    knee = 1-smooth(-.68,-.545,z)
    arm *= 1-head
    leg *= 1-head-arm
    result = {0:1-head-arm-leg, 1:head, 2+side:arm*(1-elbow),
              6+side:arm*elbow, 4+side:leg*(1-knee), 8+side:leg*knee}
    return {joint:weight for joint,weight in result.items() if weight > .00001}


def bind(objects):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'Human suit rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    bones = []
    for i, p in enumerate(PIVOTS):
        bone = rig.data.edit_bones.new('suit_joint_'+str(i))
        bone.head = p; bone.tail = Vector(p)+Vector((0,0,.08))
        if PARENTS[i] >= 0: bone.parent = bones[PARENTS[i]]
        bones.append(bone)
    bpy.ops.object.mode_set(mode='OBJECT')
    for i, bone in enumerate(rig.data.bones): bone['suitJoint'] = int(bone.name.split('_')[-1])
    for obj in objects:
        groups = [obj.vertex_groups.new(name='suit_joint_'+str(i)) for i in range(10)]
        for vertex in obj.data.vertices:
            values = weights(obj.matrix_world @ vertex.co)
            total = sum(values.values())
            for joint, weight in values.items(): groups[joint].add([vertex.index], weight/total, 'REPLACE')
        obj.parent = rig
        modifier = obj.modifiers.new('Continuous human deformation', 'ARMATURE')
        modifier.object = rig
    return rig
