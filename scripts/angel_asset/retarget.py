"""Retarget Universal Animation Library clips onto the game's identity-rest skeleton.

For each game bone the source bone's world rotation change from the shared rest stance (rest.pose_rest) is applied in the game
frame; local rotations follow from the game hierarchy. Output is in three.js axes, ready for glTF rotation channels on nodes
whose rest rotation is identity. The pelvis also gets its translation, scaled from the library body to the angel's.
"""
from math import pi
from mathutils import Matrix
import bpy
from assemble import NAMES, PARENTS
from rest import pose_rest

# Rotation source per game bone: the topmost source bone each game bone stands for.
ROTATION = {'pelvis': 'pelvis', 'spine': 'spine_02', 'chest': 'spine_03', 'neck': 'neck_01', 'head': 'Head'}
for s in 'lr':
    ROTATION.update({f'clavicle_{s}': f'clavicle_{s}', f'upperarm_{s}': f'upperarm_{s}', f'forearm_{s}': f'lowerarm_{s}',
                     f'hand_{s}': f'hand_{s}', f'thigh_{s}': f'thigh_{s}', f'shin_{s}': f'calf_{s}', f'foot_{s}': f'foot_{s}',
                     f'toe_{s}': f'ball_{s}'})
TURN = Matrix.Rotation(pi, 3, 'Z').to_quaternion()
# Blender Z up to glTF Y up: (x, y, z) -> (x, z, -y), a rotation of -90 degrees about X.
YUP = Matrix.Rotation(-pi/2, 3, 'X').to_quaternion()
FPS = 30


def to_game(q):
    """A world rotation in the source frame, expressed in three.js axes of the turned game frame."""
    q = TURN @ q @ TURN.inverted()
    return YUP @ q @ YUP.inverted()


def world_rotations(rig):
    mw = rig.matrix_world
    return {n: (mw @ rig.pose.bones[s].matrix).to_quaternion() for n, s in ROTATION.items()}


def sample(rig, action, scale, start=None, end=None):
    """Clip frames at FPS: {'times', 'rotations' [frame][bone] xyzw, 'pelvis' [frame] xyz}."""
    pose_rest(rig)
    rest = world_rotations(rig)
    rest_hip = rig.matrix_world @ rig.pose.bones['pelvis'].head
    rig.animation_data_create()
    rig.animation_data.action = action
    scene = bpy.context.scene
    first, last = action.frame_range
    first, last = start if start is not None else first, end if end is not None else last
    times, rotations, pelvis = [], [], []
    steps = max(1, round((last-first)/scene.render.fps*FPS))
    for k in range(steps+1):
        frame = first+(last-first)*k/steps
        scene.frame_set(int(frame), subframe=frame-int(frame))
        now = world_rotations(rig)
        world = [to_game(now[n] @ rest[n].inverted()) for n in NAMES]
        local = []
        for i, q in enumerate(world):
            p = PARENTS[i]
            l = q if p < 0 else world[p].inverted() @ q
            local.append([l.x, l.y, l.z, l.w])
        hip = (rig.matrix_world @ rig.pose.bones['pelvis'].head-rest_hip)*scale
        hip = Matrix.Rotation(pi, 3, 'Z') @ hip
        rotations.append(local)
        pelvis.append([hip.x, hip.z, -hip.y])
        times.append((frame-first)/scene.render.fps)
    rig.animation_data.action = None
    # Keep each bone's quaternion track on one hemisphere so linear sampling never takes the long way round.
    for i in range(len(NAMES)):
        for f in range(1, len(rotations)):
            a, b = rotations[f-1][i], rotations[f][i]
            if sum(x*y for x, y in zip(a, b)) < 0:
                rotations[f][i] = [-x for x in b]
    return {'times': times, 'rotations': rotations, 'pelvis': pelvis}
