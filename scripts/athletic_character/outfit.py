"""The Meridian Envoy outfit (Garo 2026-10-06, concept C): bone-white ceramic plates over the graphite undersuit, glowing teal seams,
an open-face helmet, a slim back flight module with two short fins, sealed boots and a left glove. The right forearm and hand stay
bare for the arm cannon (its contract is measured on the undersuit and anatomy only).

Every piece is cut from the character's own approved surfaces in the source pose (Z up, front -Y, metres), lifted off the body
along its normals and thickened, so it fits by construction; the plate rims carry the glow. build.py binds the pieces with the same
rig.weights as the body. Pure procedure: a rebuild gives the same outfit."""
from math import atan2, radians
import bpy
from outfit_shapes import ARM, BONE, GRAPHITE, LEG, TEAL, axis_param, boot, cut, module, relax


def materials():
    """`plate` takes its colour from the vertex colours (bone or graphite); `glow` is the teal light."""
    plate = bpy.data.materials.new('plate')
    plate.use_nodes = True
    nodes, bsdf = plate.node_tree.nodes, plate.node_tree.nodes['Principled BSDF']
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    plate.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = .38
    bsdf.inputs['Metallic'].default_value = 0
    glow = bpy.data.materials.new('glow')
    glow.use_nodes = True
    g = glow.node_tree.nodes['Principled BSDF']
    g.inputs['Base Color'].default_value = (.01, .05, .05, 1)
    g.inputs['Emission Color'].default_value = (*TEAL, 1)
    g.inputs['Emission Strength'].default_value = 3.5
    g.inputs['Roughness'].default_value = .3
    return plate, glow


def pieces(suit, skin):
    """Every outfit piece as (object, target triangles). `suit` and `skin` are the undersuit and anatomy meshes in source coordinates."""
    out = []
    torso_angle = lambda p: atan2(p.x, -(p.y+.02))
    # Chest: a shield from the collarbones to the lower ribs, lower toward the armpits and cut in a shallow V at the sternum.
    # Chest: two shields from the collar to under the pectorals, their lower edges rising toward the arms in a chevron, a dark
    # channel down the sternum with a line of light in it.
    for s in (-1, 1):
        out.append((cut(suit, f'chest plate {s}', lambda p, s=s: .022 < p.x*s < .165 and p.y < -.055 and 1.215+.3*abs(p.x) < p.z < 1.505-.9*max(0, abs(p.x)-.09), .008, BONE), 420))
    out.append((cut(suit, 'sternum seam', lambda p: abs(p.x) < .007 and p.y < -.06 and 1.2 < p.z < 1.52, .0018, None, thick=0, smooth=2, every=True), 60))
    out.append((cut(suit, 'back plate', lambda p: abs(p.x) < .14 and p.y > .045 and 1.17 < p.z < 1.44-.3*max(0, abs(p.x)-.07), .008, BONE), 500))
    for s in (-1, 1):
        shoulder, elbow, wrist = ARM[s]
        hip, knee, ankle = LEG[s]
        out.append((cut(suit, f'pauldron {s}', lambda p, J=shoulder, s=s: (p-J).length < .115 and p.x*s > .165 and p.z > 1.385, .010, BONE), 350))
        def thigh(p, s=s, a=hip, b=knee):
            t, ang = axis_param(p, a, b)
            return p.x*s > .02 and .4 < t < .84 and abs(ang) < radians(44+14*(t-.4)) and (p-(a+(b-a)*t)).length < .13
        out.append((cut(suit, f'thigh plate {s}', thigh, .008, BONE), 380))
        out.append((cut(suit, f'knee {s}', lambda p, K=knee: (p-K).length < .075 and p.y < K.y-.015, .011, BONE), 150))
        def shin(p, s=s, a=knee, b=ankle):
            t, ang = axis_param(p, a, b)
            return p.x*s > .03 and .1 < t < .76 and abs(ang) < radians(64) and (p-(a+(b-a)*t)).length < .11
        out.append((cut(suit, f'shin guard {s}', shin, .008, BONE), 380))
        # Boots: one sealed shell round the bare foot and the ankle (their convex hull: a flat sole, no toes), a line of light at the sole.
        out.append((boot(suit, skin, s), 0))
        # Seams of light down the outside of each leg and arm (the right forearm is the cannon's).
        def leg_seam(p, s=s):
            for a, b, lo, hi in ((hip, knee, .06, .97), (knee, ankle, .03, .9)):
                t, ang = axis_param(p, a, b)
                if lo < t < hi and abs(ang-s*radians(90)) < radians(6) and (p-(a+(b-a)*t)).length < .13:
                    return True
            return False
        out.append((cut(suit, f'leg seam {s}', leg_seam, .0018, None, thick=0, smooth=2, every=True), 100))
        def arm_seam(p, s=s):
            for a, b, hi in ((shoulder, elbow, .97), (elbow, wrist, .92 if s < 0 else 0)):
                t, ang = axis_param(p, a, b)
                if .08 < t < hi and abs(ang-s*radians(90)) < radians(8) and (p-(a+(b-a)*t)).length < .09:
                    return True
            return False
        out.append((cut(suit, f'arm seam {s}', arm_seam, .0018, None, thick=0, smooth=2, every=True), 80))
        out.append((cut(suit, f'side seam {s}', lambda p, s=s: abs(p.x) < .22 and .98 < p.z < 1.4 and abs(torso_angle(p)-s*radians(90)) < radians(4.5), .0018, None, thick=0, smooth=2, every=True), 80))
    elbow, wrist = ARM[-1][1], ARM[-1][2]
    def forearm(p, a=elbow, b=wrist):
        t, ang = axis_param(p, a, b)
        return p.x < -.2 and .16 < t < .8 and abs(ang) < radians(75) and (p-(a+(b-a)*t)).length < .08
    out.append((cut(suit, 'forearm guard', forearm, .007, BONE), 220))
    out.append((cut(skin, 'glove', lambda p: p.x < -.365 and .84 < p.z < 1.045, .0035, GRAPHITE, thick=0, smooth=2), 380))
    out.append((cut(suit, 'collar', lambda p: 1.536 < p.z < 1.556, .002, None, thick=0, smooth=0), 100))
    # Open-face helmet: the head shell above the jaw line, the face left bare (a blank helmet hid which way the hero faced).
    face = lambda p: p.y < -.07 and 1.598 < p.z < 1.776 and abs(p.x) < .066
    helmet = cut(skin, 'helmet', lambda p: p.z > 1.6-.04*max(0, p.y) and not face(p), .016, BONE, thick=.007, smooth=8)
    relax(helmet, 12)
    out.append((helmet, 900))
    out.append((module('flight module'), 0))
    return out


def finish(items):
    """Brings the pieces to their budget, thickens them (the rim takes the glow), paints them by vertex colour and joins them into one
    skinned surface with two materials, `plate` and `glow`."""
    plate, glow = materials()
    done = []
    for obj, target in items:
        obj.data.materials.clear()
        for material in ([glow] if obj.get('glow') else [plate, glow]):
            obj.data.materials.append(material)
        tris = sum(len(p.vertices)-2 for p in obj.data.polygons)
        if target and tris > target:
            dec = obj.modifiers.new('budget', 'DECIMATE')
            dec.ratio, dec.use_collapse_triangulate = target/tris, True
        if obj.get('thick'):
            solid = obj.modifiers.new('plate', 'SOLIDIFY')
            # Rim only: the plate's underside lies on the body and is never seen. No even offset: on the thin triangles the budget
            # leaves, it divides by a near-zero angle and threw a vertex metres out (2026-10-06).
            solid.thickness, solid.offset, solid.use_rim, solid.use_rim_only = obj['thick'], -1, True, True
            solid.material_offset_rim = 1 if obj.get('rim') else 0
        bpy.context.view_layer.update()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        obj.modifiers.clear()
        old, obj.data = obj.data, mesh
        bpy.data.meshes.remove(old)
        colour = tuple(obj.get('colour', (1, 1, 1, 1)))
        col = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        tone = mesh.attributes.get('tone')  # the module paints face by face: 1 bone, 0 graphite
        for poly in mesh.polygons:
            c = colour if tone is None else (BONE if tone.data[poly.index].value else GRAPHITE)
            for i in poly.loop_indices:
                col.data[i].color_srgb = c
        if tone is not None:
            mesh.attributes.remove(tone)
        mesh.color_attributes.active_color = col
        done.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in done:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = done[0]
    bpy.ops.object.join()
    armour = bpy.context.object
    armour.name, armour.data.name = 'Explorer armour', 'Explorer armour mesh'
    mesh = armour.data
    while mesh.uv_layers:  # untextured: no texcoords in the file
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.use_auto_smooth, mesh.auto_smooth_angle = True, radians(35)
    for p in mesh.polygons:
        p.use_smooth = True
    for key in ('thick', 'rim', 'colour', 'glow'):
        if key in armour:
            del armour[key]
    return armour


def make(suit, skin):
    """The whole outfit as one object, from the undersuit and anatomy meshes in source coordinates."""
    return finish(pieces(suit, skin))
