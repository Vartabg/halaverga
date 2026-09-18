"""Deterministic smooth weights on a 21-bone skeleton that keeps the ten neutral-axis animation controls."""
import bpy
from math import hypot
from mathutils import Vector

# Name, head (Blender metres: Z up, the explorer faces +Y), parent index. Indices 0-9 are the legacy joints and
# their pivots; src/world/suitSkeleton.ts mirrors this table. Parents may come later in the list.
BONES = [('pelvis',(0,0,0),-1),('head',(0,0,.675),12),('upperarm_l',(-.245,0,.55),13),('upperarm_r',(.245,0,.55),14),
  ('thigh_l',(-.10,0,0),0),('thigh_r',(.10,0,0),0),('forearm_l',(-.302,0,.215),2),('forearm_r',(.302,0,.215),3),
  ('shin_l',(-.119,0,-.51),4),('shin_r',(.119,0,-.51),5),('spine',(0,0,.12),0),('chest',(0,0,.34),10),('neck',(0,0,.60),11),
  ('clavicle_l',(-.045,0,.55),11),('clavicle_r',(.045,0,.55),11),('hand_l',(-.324,0,-.075),6),('hand_r',(.324,0,-.075),7),
  ('foot_l',(-.112,-.01,-.905),8),('foot_r',(.112,-.01,-.905),9),('toe_l',(-.11,.125,-.965),17),('toe_r',(.11,.125,-.965),18)]
# The legacy joint each bone's weight is carved from.
OWNER = [0,1,2,3,4,5,6,7,8,9, 0,0,0,0,0, 6,7, 8,9, 8,9]


def smooth(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)


def legacy_weights(point):
    """The ten-joint weights. Every added bone takes its share from one of these, so the rest surface is unchanged."""
    x, _, z = point
    side = 0 if x < 0 else 1
    head = smooth(.67,.735,z)
    arm = smooth(.195,.28,abs(x)) * (1-smooth(.54,.64,z))
    # At hip height hands remain outside the legs' weighting region.
    leg = (1-smooth(-.085,.07,z)) * (1-smooth(.21,.26,abs(x)))
    elbow = 1-smooth(.16,.27,z)
    knee = 1-smooth(-.575,-.45,z)
    arm *= 1-head
    leg *= 1-head-arm
    result = {0:1-head-arm-leg, 1:head, 2+side:arm*(1-elbow),
              6+side:arm*elbow, 4+side:leg*(1-knee), 8+side:leg*knee}
    return {joint:weight for joint,weight in result.items() if weight > .00001}


def carve(point):
    """How each added bone shares out its legacy joint's weight at a point: {legacy joint: {bone: fraction}}."""
    x, y, z = point
    s = 0 if x < 0 else 1
    # The clavicle takes the top of the shoulder, reaching lower over the shoulder cap than over the chest plates.
    # The neck takes only its own column, so turning the head leaves the shoulders where they are.
    low = .52-.06*smooth(.19,.24,abs(x))
    clavicle = smooth(.04,.09,abs(x))*smooth(low,low+.04,z)*(1-smooth(.62,.66,z))
    neck = smooth(.58,.64,z)*(1-smooth(.07,.10,hypot(x,y)))
    s1, s2 = smooth(.05,.20,z), smooth(.25,.40,z)
    # Hands below the wrist; feet below the ankle, with the toes ahead of the ball of the foot.
    wrist, ankle, toe = 1-smooth(-.10,-.045,z), 1-smooth(-.93,-.86,z), smooth(.12,.16,y)
    trunk = 1-clavicle
    return {0:{0:trunk*(1-s1), 10:trunk*s1*(1-s2), 11:trunk*s2*(1-neck), 12:trunk*s2*neck, 13+s:clavicle},
            6+s:{6+s:1-wrist, 15+s:wrist}, 8+s:{8+s:1-ankle, 17+s:ankle*(1-toe), 19+s:ankle*toe}}


def rider(point):
    """The carve at a point, with each legacy joint's whole share given to its largest bone there."""
    return {owner:{max(fractions, key=fractions.get):1} for owner, fractions in carve(point).items()}


def weights(point, shares=None):
    """Legacy weights at the point, shared out by `shares` (default: the carve at the point itself)."""
    shares = shares or carve(point)
    result = {}
    for owner, weight in legacy_weights(point).items():
        for joint, fraction in shares.get(owner, {owner:1}).items():
            result[joint] = result.get(joint,0)+weight*fraction
    return {joint:weight for joint,weight in result.items() if weight > .00001}


def normalized(values):
    total = sum(values.values())
    return {joint:weight/total for joint,weight in values.items()}


def checked(point, shares=None):
    """Weights for one vertex, failing the build if the rest surface or the four-influence limit would change."""
    values = normalized(weights(point, shares))
    if len(values) > 4: raise AssertionError('More than four bone influences at %s' % (tuple(point),))
    owners = {}
    for joint, weight in values.items(): owners[OWNER[joint]] = owners.get(OWNER[joint],0)+weight
    legacy = normalized(legacy_weights(point))
    for joint in set(owners)|set(legacy):
        if abs(owners.get(joint,0)-legacy.get(joint,0)) > 5e-5:
            raise AssertionError('Bone %d changed its legacy weight at %s' % (joint, tuple(point)))
    return values


def bind(objects, body):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'Human suit rig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    # Every bone first, then parents: the head and upper arms hang from bones created after them.
    # Tails along +Z keep every rest orientation at identity in the exported glTF.
    bones = []
    for name, head, _ in BONES:
        bone = rig.data.edit_bones.new(name)
        bone.head = head; bone.tail = Vector(head)+Vector((0,0,.08))
        bones.append(bone)
    for bone, (_, _, parent) in zip(bones, BONES):
        if parent >= 0: bone.parent = bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for i, (name, _, _) in enumerate(BONES): rig.data.bones[name]['suitJoint'] = i
    for obj in objects:
        groups = [obj.vertex_groups.new(name=name) for name, _, _ in BONES]
        # The undersuit bends smoothly across the added bones. Within each legacy joint, every other piece (plates,
        # seams, the collar, the face and hair) rides the single added bone that covers most of it at its centre, so it
        # stays rigid instead of creasing or shrinking when an added bone turns.
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        shares = None if obj == body else rider(sum(points, Vector())/max(1,len(points)))
        for vertex, point in zip(obj.data.vertices, points):
            for joint, weight in checked(point, shares).items():
                groups[joint].add([vertex.index], weight, 'REPLACE')
        obj.parent = rig
        modifier = obj.modifiers.new('Continuous human deformation', 'ARMATURE')
        modifier.object = rig
    return rig
