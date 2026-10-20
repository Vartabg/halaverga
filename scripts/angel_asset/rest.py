"""Pose a Quaternius humanoid from its T-pose into the game's rest stance.

The game's 21-bone skeleton rests at identity with the arms hanging about eight degrees out (src/world/suitSkeleton.ts and the
flight clips assume it). Every source armature (body, outfits, hair and both animation libraries) is posed by the same rule, so
their meshes bake into one stance and the clip retarget measures every motion from that same stance.
Source frame: Blender, Z up, the character faces -Y, its left side is +X.
"""
from mathutils import Matrix, Quaternion, Vector
import bpy

# Bone directions of the current angel (public/models/angel.glb, right side, three.js axes) converted to the source frame:
# three (x, y, z) -> source (-x, z, y) for the right side; the left side mirrors x.
ARM = {'upperarm': Vector((-.061, 0, -.291)), 'lowerarm': Vector((-.018, -.011, -.268))}
FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')


def world_dir(rig, name):
    pb = rig.pose.bones[name]
    return (rig.matrix_world.to_3x3() @ (pb.tail - pb.head)).normalized()


def aim(rig, name, target):
    """Swing a bone about its head so it points along target, the least rotation that does it."""
    pb = rig.pose.bones[name]
    delta = world_dir(rig, name).rotation_difference(target.normalized()).to_matrix().to_4x4()
    head = Matrix.Translation(pb.head)
    pb.matrix = head @ delta @ head.inverted() @ pb.matrix
    bpy.context.view_layer.update()


def finger_pose(rig, action, frame):
    """Local finger rotations of one clip frame (a grip for the sword hand, a relaxed hand for the other)."""
    rig.animation_data_create()
    rig.animation_data.action = action
    bpy.context.scene.frame_set(int(frame))
    pose = {pb.name: pb.rotation_quaternion.copy() for pb in rig.pose.bones if pb.name.startswith(FINGERS)}
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    bpy.context.view_layer.update()
    return pose


def pose_rest(rig, fingers=None):
    """Clear the pose, lower both arms into the game stance and curl the fingers."""
    if rig.animation_data:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))
    bpy.context.view_layer.update()
    for side, sign in (('r', 1), ('l', -1)):
        for part in ('upperarm', 'lowerarm'):
            d = ARM[part].copy()
            d.x *= sign
            aim(rig, f'{part}_{side}', d)
    for name, q in (fingers or {}).items():
        if name in rig.pose.bones:
            rig.pose.bones[name].rotation_quaternion = q
    bpy.context.view_layer.update()


def bake(rig, meshes):
    """Apply the posed armature to each mesh, keeping its vertex groups for the reweighting that follows."""
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
        mod.object = rig
        bpy.ops.object.modifier_apply(modifier=mod.name)
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix()
