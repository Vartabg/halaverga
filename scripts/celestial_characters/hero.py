"""Build the new warrior on the approved anatomy without altering that source."""
from math import sin
import bpy
import bmesh
from mathutils import Vector
from mesh import material, surface, join, sphere, paint, export, apply
import regalia
import hair
from rig import bind, NAMES


def build(root, sources):
    gold = material('Chased bronze', (.40,.25,.09), .78, .34)
    edge = material('Burnished gold', (.71,.51,.20), .82, .27)
    skin = material('Living skin', (.36,.19,.115), 0, .66)
    ivory = material('Ivory linen', (.69,.65,.52), 0, .91)
    crimson = material('Crimson silk', (.20,.012,.021), 0, .72)
    leather = material('Oxblood leather', (.038,.015,.012), 0, .65)
    brown = material('Chestnut hair', (.032,.015,.008), 0, .56)
    sclera = material('Eyes', (.43,.39,.33), 0, .38)
    iris = material('Agate', (.06,.105,.075), .12, .22)
    for o in sources.values():
        for mod in o.modifiers:
            if mod.type == 'SOLIDIFY':
                mod.show_viewport = False
    bpy.context.view_layer.update()
    body = surface(sources['suit'], 'Woven undergarment', 18000, ivory)
    face = surface(sources['skin'], 'Anatomical face and hands', 14000, skin)
    # Deliberate warm skin tones, shading the lips and brows without painting a flat face over the anatomy.
    def tone(p):
        lip = max(0, 1-abs(p.z-1.665)/.013)*max(0, 1-abs(p.x)/.036) if p.y < -.11 else 0
        brow = max(0,1-abs(p.z-1.761)/.008) if p.y < -.11 and .016 < abs(p.x) < .063 else 0
        return (.92-.19*lip-.44*brow, .79-.30*lip-.44*brow, .70-.29*lip-.39*brow)
    paint(face, tone)
    parts = [body, face]
    parts += regalia.make(body.data, face.data, gold, edge, ivory, crimson, leather)
    parts += hair.make(face.data, brown, gold, edge, iris)
    # Hidden cloth under the rigid cuirass cannot poke through its smooth, bridged sternum.
    bm=bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if all(.995<v.co.z<1.445 and abs(v.co.x)<.202 for v in f.verts)],context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    for key in ['eyeL','eyeR']:
        eye = surface(sources[key], 'Warrior eyes', 400, sclera)
        parts.append(eye)
        centre = sum((v.co for v in eye.data.vertices), Vector())/len(eye.data.vertices)
        parts.append(sphere('Iris', (centre.x, centre.y-.0132, centre.z), (.0055,.0015,.0055), iris, 16, 10))
        parts.append(sphere('Pupil', (centre.x, centre.y-.0146, centre.z), (.0024,.0007,.0024), brown, 12, 8))
    rig = bind(parts)
    # Cloth hangs from its fastener. It must not inherit the knee's weights just because its hem is beside a shin.
    for obj in parts:
        bone = 'pelvis' if any(x in obj.name for x in ['linen','pteruges','Pteruges']) else 'chest' if any(x in obj.name for x in ['mantle','Mantle']) else None
        if bone:
            obj.vertex_groups.clear()
            group = obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
        if obj.name.startswith(('Fitted hair','Swept','Nape','Open diadem','Laurel','Brow','Iris','Pupil','Warrior eyes')):
            obj.vertex_groups.clear()
            obj.vertex_groups.new(name='head').add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    hero = join(parts, 'Warrior — fitted regalia')
    hero.parent = rig
    tris=sum(len(p.vertices)-2 for p in hero.data.polygons)
    if tris>78000:
        dec=hero.modifiers.new('Character delivery budget','DECIMATE')
        dec.ratio=78000/tris
        dec.use_collapse_triangulate=True
        apply(hero,dec.name)
    # Join keeps one armature modifier and the original groups; the export splits only by material.
    export([hero, rig], root/'public/models/angel.glb', True)
    return hero, rig
