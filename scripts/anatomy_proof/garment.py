"""Extract an actual fitted cloth shell with clean neckline, cuffs and ankles."""
import bpy
import bmesh
from math import exp
from mathutils import Vector
from common import material

NECK = 1.573
ANKLE = .098
WRIST_X, WRIST_Z = .421, 1.003


def covered(point):
    x, y, z = point
    wrist = .30*(abs(x)-WRIST_X)-.954*(z-WRIST_Z)
    hand = abs(x) > .34 and z > .72 and wrist > .000001
    return ANKLE-.000001 <= z <= NECK+.000001 and not hand


def clip(data, cloth):
    bm = bmesh.new()
    bm.from_mesh(data)
    planes = [((0, 0, NECK), (0, 0, 1)), ((0, 0, ANKLE), (0, 0, 1))]
    planes += [((s*WRIST_X, 0, WRIST_Z), (s*.30, 0, -.954)) for s in [-1, 1]]
    for point, normal in planes:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                              plane_co=point, plane_no=normal, dist=.0000001)
    remove = [face for face in bm.faces if covered(face.calc_center_median()) != cloth]
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(data)
    bm.free()
    data.update()


def build_garment(master):
    bpy.context.view_layer.update()
    evaluated = master.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = bpy.data.meshes.new_from_object(evaluated)
    data.transform(master.matrix_world)
    cloth_data = data.copy()
    clip(data, False)
    clip(cloth_data, True)
    cloth = bpy.data.objects.new('Undersuit - fitted cloth surface', cloth_data)
    exposed = bpy.data.objects.new('Anatomy - exposed head hands and feet', data)
    for obj in [cloth, exposed]:
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.clear()
        for face in obj.data.polygons:
            face.material_index = 0
            face.use_smooth = True
    cloth.data.materials.append(material('Graphite stretch fabric', (.095, .125, .15), .8))
    exposed.data.materials.append(material('Neutral anatomy study', (.38, .32, .275), .65))
    # Preserve the exact cut loops while relaxing scan-level skin detail under cloth.
    group = cloth.vertex_groups.new(name='Fabric relaxation - preserve hems')
    detail = cloth.vertex_groups.new(name='Fabric bridges skin-only details')
    for v in cloth.data.vertices:
        x, y, z = v.co
        distance = min(abs(z-NECK), abs(z-ANKLE))
        if abs(x) > .33 and z > .75:
            distance = min(distance, abs(.30*(abs(x)-WRIST_X)-.954*(z-WRIST_Z)))
        group.add([v.index], min(1, distance/.025), 'REPLACE')
        front = max(0, min(1, (-y-.045)/.055))
        nipple = exp(-((abs(x)-.14)/.055)**2-((z-1.345)/.055)**2)
        navel = exp(-(x/.035)**2-((z-1.125)/.045)**2)
        detail.add([v.index], min(1, nipple+navel)*front, 'REPLACE')
    relax = cloth.modifiers.new('Fabric softens skin microdetail', 'SMOOTH')
    relax.factor, relax.iterations, relax.vertex_group = .55, 5, group.name
    bridge = cloth.modifiers.new('Cloth bridges nipples and navel', 'SMOOTH')
    bridge.factor, bridge.iterations, bridge.vertex_group = .8, 20, detail.name
    thickness = cloth.modifiers.new('Fine garment thickness', 'SOLIDIFY')
    thickness.thickness, thickness.offset = .0018, 1
    thickness.use_even_offset = True
    master.hide_render = True
    master.hide_set(True)
    cloth['derived_from'] = master.name
    cloth['construction'] = 'Evaluated anatomical surface; planar hems; relaxed skin detail; 1.8 mm thickness'
    exposed['derived_from'] = master.name
    return cloth, exposed
