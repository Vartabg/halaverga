"""Body-surface shells for clothes and armour, from a baked MPFB body (source frame: Z up, faces -Y, left is +X): keep the faces
a test picks, smooth them, hold them a set distance off the skin, and weight each vertex from the skin under it. Also the
helpers they share: the strongest bone per vertex, bone heads and positions along a bone, and a decimation that spares open edges.
"""
import bmesh
import bpy
from mathutils import bvhtree


def dominant(obj):
    """Strongest bone group per vertex (MPFB's 'Delete.<garment>' masks are not bones and are skipped)."""
    names = {g.index: g.name for g in obj.vertex_groups if not g.name.startswith('Delete.')}
    out = []
    for v in obj.data.vertices:
        bones = [g for g in v.groups if g.group in names]
        out.append(names[max(bones, key=lambda g: g.weight).group] if bones else None)
    return out


def decimate_inside(obj, triangles, factor=20.0):
    """Collapse to `triangles` but make the open edges (neck, sleeve and leg hems, armour rims) and their first ring costly to collapse,
    so the hems stay smooth instead of turning into teeth."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    rim = {v.index for v in bm.verts if v.is_boundary}
    rim |= {e.other_vert(v).index for v in bm.verts if v.index in rim for e in v.link_edges}
    bm.free()
    group = obj.vertex_groups.new(name='_decimate')
    group.add([v.index for v in obj.data.vertices if v.index not in rim], 1.0, 'REPLACE')
    group.add(list(rim), 0.0, 'REPLACE')
    mod = obj.modifiers.new('budget', 'DECIMATE')
    mod.ratio = min(1.0, triangles / sum(len(p.vertices) - 2 for p in obj.data.polygons))
    mod.use_collapse_triangulate = True
    mod.vertex_group, mod.vertex_group_factor = group.name, factor
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.vertex_groups.remove(obj.vertex_groups['_decimate'])


def head(rig, bone):
    return rig.matrix_world @ rig.pose.bones[bone].head


def along(rig, bone, co):
    """0 at the bone head, 1 at its tail."""
    pb = rig.pose.bones[bone]
    a, b = rig.matrix_world @ pb.head, rig.matrix_world @ pb.tail
    return (co - a).dot(b - a) / (b - a).length_squared


def shell(body, name, keep, offset, smooth=24, flare=None, edge_smooth=0, exclude=()):
    """Faces of the body whose vertices all pass keep(co, dominant bone) become a shell: smoothed to drop muscle detail, then
    every vertex held at least `offset` outside the skin (nearest-surface test), then an optional flare(bm) pass. edge_smooth
    passes even out the open edges along themselves first (a cut across the mesh is a staircase of faces). Weights come from
    the skin under each finished vertex, without bones named in `exclude` (a cuirass must not follow the arm at the armpit)."""
    dom = dominant(body)
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    src = bmesh.new()
    src.from_mesh(body.data)
    tree = bvhtree.BVHTree.FromBMesh(src)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    kept = [keep(v.co, dom[v.index]) for v in bm.verts]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(kept[v.index] for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for _ in range(edge_smooth):
        rim = {v: [e.other_vert(v).co.copy() for e in v.link_edges if e.is_boundary] for v in bm.verts if v.is_boundary}
        for v, near in rim.items():
            if len(near) == 2:
                v.co = v.co.lerp((near[0] + near[1]) / 2, .5)
    for v in bm.verts:
        loc, normal, _, _ = tree.find_nearest(v.co)
        if (v.co - loc).dot(normal) < offset:
            v.co = loc + normal * offset
    bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=.5, use_axis_x=True, use_axis_y=True,
                          use_axis_z=True)
    if flare:
        flare(bm)
    # Smoothing moved the vertices away from the skin they were copied from; give each the weights of the skin under it now,
    # so shell and skin bend alike and the offset holds in deep poses (layers over layers then stay apart).
    deform, skin = bm.verts.layers.deform.verify(), src.verts.layers.deform.verify()
    src.faces.ensure_lookup_table()
    names = {g.index: g.name for g in body.vertex_groups}
    dropped = {g.index for g in body.vertex_groups if g.name.startswith(exclude)} if exclude else set()
    for v in bm.verts:
        loc, _, face, _ = tree.find_nearest(v.co)
        corners = src.faces[face].verts
        near = [1 / max((c.co - loc).length, 1e-5) for c in corners]
        mix = {}
        for c, k in zip(corners, near):
            for g, x in c[skin].items():
                if g not in dropped:
                    mix[g] = mix.get(g, 0) + x * k / sum(near)
        if not any(x > 0 for g, x in mix.items() if not names[g].startswith('Delete.')):
            continue  # nothing allowed underneath: keep the copied weights
        v[deform].clear()
        for g, x in mix.items():
            v[deform][g] = x
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    src.free()
    return obj
