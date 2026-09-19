"""Fit the approved A-pose to neutral flight axes without reshaping the trunk."""
from math import cos, sin, radians, hypot
from mathutils import Vector
import bpy

SCALE = 1.98 / 1.85
ROOT_HEIGHT = .962
NAMES = ['pelvis', 'head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r',
         'forearm_l', 'forearm_r', 'shin_l', 'shin_r', 'spine', 'chest', 'neck',
         'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r']
PARENTS = [-1, 12, 13, 14, 0, 0, 2, 3, 4, 5, 0, 10, 11, 11, 11, 6, 7, 8, 9, 17, 18]
# Points in the proof's world coordinates: Z up, front -Y. Arms are lowered
# fourteen degrees into the same relaxed rest stance assumed by the flight clips.
POINTS = [(0, 0, ROOT_HEIGHT), (0, 0, 1.624),
          (-.223, 0, 1.492), (.223, 0, 1.492), (-.100, 0, ROOT_HEIGHT), (.100, 0, ROOT_HEIGHT),
          (-.344, 0, 1.242), (.344, 0, 1.242), (-.110, 0, .513), (.110, 0, .513),
          (0, 0, 1.085), (0, 0, 1.305), (0, 0, 1.550),
          (-.048, 0, 1.492), (.048, 0, 1.492), (-.421, -.01, 1.003), (.421, -.01, 1.003),
          (-.102, 0, .112), (.102, 0, .112), (-.106, -.12, .043), (.106, -.12, .043)]


def smooth(a, b, v):
    t = min(1, max(0, (v-a)/(b-a)))
    return t*t*(3-2*t)


def arm_share(point):
    x, _, z = point
    inner = .185+.08*(1-smooth(1.1, 1.4, z))
    return smooth(inner, inner+.06, abs(x))*smooth(.70, .82, z)*(1-smooth(1.51, 1.58, z))


def rest(point, arm=None):
    x, y, z = point
    share = arm_share(point) if arm is None else arm
    angle = radians(14) * (1 if x >= 0 else -1)
    centre = .223 * (1 if x >= 0 else -1)
    dx, dz = x-centre, z-1.492
    rx = centre+cos(angle)*dx+sin(angle)*dz
    rz = 1.492-sin(angle)*dx+cos(angle)*dz
    # Reflection across Y changes front -Y to +Y. X is kept to preserve joint labels.
    return Vector(((x+(rx-x)*share)*SCALE, -y*SCALE, (z+(rz-z)*share-ROOT_HEIGHT)*SCALE))


def weights(point):
    x, y, z = point
    side = 0 if x < 0 else 1
    arm = arm_share(point)
    head = smooth(1.584, 1.647, z)
    leg = (1-smooth(.915, 1.065, z))*(1-arm)
    trunk = max(0, 1-arm-head-leg)
    elbow = 1-smooth(1.19, 1.30, z)
    wrist = 1-smooth(.975, 1.033, z)
    knee = 1-smooth(.46, .566, z)
    ankle = 1-smooth(.095, .155, z)
    toe = smooth(.105, .155, -y)
    waist, chest = smooth(.995, 1.16, z), smooth(1.21, 1.40, z)
    neck = smooth(1.50, 1.58, z)*(1-smooth(.07, .125, hypot(x, y)))
    clavicle = smooth(1.425, 1.51, z)*smooth(.10, .19, abs(x))*(1-neck)*.55
    torso = trunk*(1-clavicle)
    result = {0: torso*(1-waist), 10: torso*waist*(1-chest),
              11: torso*waist*chest*(1-neck), 12: torso*waist*chest*neck, 1: head,
              13+side: trunk*clavicle, 2+side: arm*(1-elbow),
              6+side: arm*elbow*(1-wrist), 15+side: arm*elbow*wrist}
    # Centre-line groin vertices share both thighs instead of switching abruptly.
    right = smooth(-.04, .04, x)
    for s, share in [(0, 1-right), (1, right)]:
        result[4+s] = leg*share*(1-knee)
        result[8+s] = leg*share*knee*(1-ankle)
        result[17+s] = leg*share*knee*ankle*(1-toe)
        result[19+s] = leg*share*knee*ankle*toe
    strongest = sorted(((i, w) for i, w in result.items() if w > .00001), key=lambda p: -p[1])[:4]
    total = sum(w for _, w in strongest)
    return {i: w/total for i, w in strongest}


def bind(objects):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'Athletic explorer flight rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    bones = []
    for i, (name, point) in enumerate(zip(NAMES, POINTS)):
        bone = rig.data.edit_bones.new(name)
        bone.head = rest(point, 1 if i in [2, 3, 6, 7, 15, 16] else 0)
        bone.tail = bone.head+Vector((0, 0, .08))
        bones.append(bone)
    for i, parent in enumerate(PARENTS):
        if parent >= 0:
            bones[i].parent = bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objects:
        obj.vertex_groups.clear()
        groups = [obj.vertex_groups.new(name=name) for name in NAMES]
        for vertex in obj.data.vertices:
            point = vertex.co.copy()
            influence = {1: 1} if obj.name == 'Explorer eyes' else weights(point)
            for joint, weight in influence.items():
                groups[joint].add([vertex.index], weight, 'REPLACE')
            vertex.co = rest(point)
        # Y reflection reverses the triangle winding as well as the coordinate.
        obj.data.flip_normals()
        obj.data.update()
        obj.parent = rig
        mod = obj.modifiers.new('Flight skin', 'ARMATURE')
        mod.object = rig
    return rig
