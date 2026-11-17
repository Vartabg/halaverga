"""Put a dressed MPFB game_engine human onto the game's 21-bone identity-rest skeleton, by the angel build's method
(scripts/angel_asset): pose into the game rest stance, bake, sum weights onto the 21 bones, build the skeleton from the posed heads.

MPFB's game_engine rig uses the same UE names as the Quaternius rigs except 'head' (Quaternius 'Head') and 'Root' (Quaternius
'root'), so assemble.HEADS is pointed at 'head' and the rest of the mapping is shared. The MakeHuman hand starts from an A-pose
with its own palm twist and finger curl, so after the arms are aimed the forearm is turned and the hand and finger bones are aimed
to match the Quaternius reference hand (the stance the clips are measured from). MPFB's spine_03 starts low on the ribs, so the
game chest (the wing root) is raised to a set height above the pelvis and the chest weights below it fade onto the spine.
"""
from math import degrees, pi
from mathutils import Matrix, Quaternion, Vector
import bmesh
import bpy
import assemble
import rest

assemble.HEADS['head'] = 'head'
FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')
SEGMENTS = [f'{f}_0{i}' for f in FINGERS for i in (1, 2, 3)]
CHEST_FADE = .10  # metres below the raised chest head over which chest weight hands over to the spine


def hand_frame(rig, side):
    """World vectors of one hand: forearm axis, wrist to middle knuckle, pinky knuckle to index knuckle, and finger directions."""
    mw, pb = rig.matrix_world, rig.pose.bones
    head = lambda n: mw @ pb[f'{n}_{side}'].head
    return {'forearm': rest.world_dir(rig, f'lowerarm_{side}'),
            'along': (head('middle_01') - head('hand')).normalized(),
            'across': (head('index_01') - head('pinky_01')).normalized(),
            'fingers': {s: rest.world_dir(rig, f'{s}_{side}') for s in SEGMENTS}}


def reference(ual_rig, fingers):
    """The Quaternius hands in the game rest stance with the build's grip (right) and relaxed (left) fingers."""
    rest.pose_rest(ual_rig, fingers)
    ref = {s: hand_frame(ual_rig, s) for s in 'lr'}
    rest.pose_rest(ual_rig)
    return ref


def _turn(rig, bone, q):
    pb = rig.pose.bones[bone]
    head = Matrix.Translation(pb.head)
    pb.matrix = head @ q.to_matrix().to_4x4() @ head.inverted() @ pb.matrix
    bpy.context.view_layer.update()


def _signed(a, b, axis):
    return a.angle(b) if axis.dot(a.cross(b)) >= 0 else -a.angle(b)


def match_hand(rig, ref, side):
    """Turn the forearm about its axis so the palm faces like the reference, then align the hand and aim each finger segment."""
    axis = rest.world_dir(rig, f'lowerarm_{side}')
    flat = lambda v, a: (v - a * v.dot(a)).normalized()
    twist = _signed(flat(hand_frame(rig, side)['across'], axis), flat(ref['across'], axis), axis)
    _turn(rig, f'lowerarm_{side}', Quaternion(axis, twist))
    now = hand_frame(rig, side)
    q1 = now['along'].rotation_difference(ref['along'])
    a2 = ref['along']
    q2 = Quaternion(a2, _signed(flat(q1 @ now['across'], a2), flat(ref['across'], a2), a2))
    wrist = q2 @ q1
    _turn(rig, f'hand_{side}', wrist)
    for seg in SEGMENTS:
        rest.aim(rig, f'{seg}_{side}', ref['fingers'][seg])
    return {'forearm_twist_deg': round(degrees(twist), 1), 'wrist_turn_deg': round(degrees(wrist.angle), 1)}


def pose(rig, ref):
    rest.pose_rest(rig)
    return {side: match_hand(rig, ref[side], side) for side in 'rl'}


def head_of(rig, bone):
    return rig.matrix_world @ rig.pose.bones[bone].head


def leg(rig):
    """Hip to ankle height in the rest stance (the clips' pelvis translation is scaled by the ratio of these)."""
    return head_of(rig, 'thigh_l').z - head_of(rig, 'foot_l').z


def strip(obj):
    """Drop every modifier but the armature (MPFB's delete masks are applied by delete_hidden after the bake)."""
    for m in [m for m in obj.modifiers if m.type != 'ARMATURE']:
        obj.modifiers.remove(m)
    for g in [g for g in obj.vertex_groups if g.name == 'Root']:
        g.name = 'root'


def delete_hidden(body):
    """Remove the body vertices MPFB marks as hidden by clothes (its 'Delete.<asset>' groups, weight over a half)."""
    groups = {g.index for g in body.vertex_groups if g.name.startswith('Delete.')}
    doomed = {v.index for v in body.data.vertices if any(g.group in groups and g.weight > .5 for g in v.groups)}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in doomed], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    for g in [g for g in body.vertex_groups if g.name.startswith('Delete.')]:
        body.vertex_groups.remove(g)
    return len(doomed)


def chest_point(rig, above):
    """Where the raised chest head goes: on the spine_03 -> neck_01 line, `above` metres over the pelvis head."""
    pelvis, low, high = head_of(rig, 'pelvis'), head_of(rig, 'spine_03'), head_of(rig, 'neck_01')
    t = min(1, max(0, (pelvis.z + above - low.z) / (high.z - low.z)))
    return low.lerp(high, t)


def fade_chest(obj, chest_z):
    """Chest weight of vertices below the raised chest head moves onto the spine, fully at CHEST_FADE below it."""
    chest, spine = obj.vertex_groups['chest'], obj.vertex_groups['spine']
    for v in obj.data.vertices:
        if v.co.z >= chest_z:
            continue
        w = next((g.weight for g in v.groups if g.group == chest.index), 0)
        if w <= 0:
            continue
        f = min(1, (chest_z - v.co.z) / CHEST_FADE)
        s = next((g.weight for g in v.groups if g.group == spine.index), 0)
        chest.add([v.index], w * (1 - f), 'REPLACE')
        spine.add([v.index], s + w * f, 'REPLACE')


def raise_chest(skeleton, point):
    bpy.context.view_layer.objects.active = skeleton
    bpy.ops.object.mode_set(mode='EDIT')
    bone = skeleton.data.edit_bones['chest']
    bone.head, bone.tail = point, point + Vector((0, 0, .08))
    bpy.ops.object.mode_set(mode='OBJECT')


def to_game(rig, pieces, ref, budgets, chest_above, dress=None):
    """pieces: {role: object}, 'body' first. budgets: {role: triangles}. dress(rig, baked pieces) may add or trim pieces (armour)
    while they still carry the MPFB groups. Returns (skeleton, meshes, report): every piece joined into one mesh, but for a
    'plate' piece (the Watcher's cuirass), which stays its own mesh named 'plate' so the game can hide it when it breaks."""
    report = {'hands': pose(rig, ref)}
    for o in pieces.values():
        strip(o)
    rest.bake(rig, list(pieces.values()))
    if dress:
        report['dress'] = dress(rig, pieces)
    body = pieces['body']
    report['body_vertices_hidden_by_clothes'] = delete_hidden(body)
    report['triangles'] = {}
    for role, o in pieces.items():
        before = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if role in budgets:
            assemble.decimate(o, budgets[role])
        report['triangles'][role] = [before, sum(len(p.vertices) - 2 for p in o.data.polygons)]
        assemble.single_uv(o) if o.data.uv_layers else None
        assemble.reweight(o)
    point = chest_point(rig, chest_above)
    for o in pieces.values():
        fade_chest(o, point.z)
    sole = min(v.co.z for o in pieces.values() for v in o.data.vertices)
    pelvis = head_of(rig, 'pelvis')
    place = Matrix.Rotation(pi, 4, 'Z') @ Matrix.Translation(-pelvis)
    skeleton = assemble.build_rig(rig, place)
    raise_chest(skeleton, place @ point)
    report.update({'pelvis_to_sole_m': round(pelvis.z - sole, 4), 'leg_m': leg(rig),
                   'chest_above_pelvis_m': round(point.z - pelvis.z, 4),
                   'chest_raised_by_m': round(point.z - head_of(rig, 'spine_03').z, 4)})
    meshes = [assemble.join([o for r, o in pieces.items() if r != 'plate'], skeleton, place)]
    if 'plate' in pieces:
        meshes.append(assemble.join([pieces['plate']], skeleton, place))
        meshes[-1].name = meshes[-1].data.name = 'plate'
    return skeleton, meshes, report
