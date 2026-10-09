"""Blender mesh authoring primitives, using game coordinates (Y up)."""
import math
import random
import bpy
from mathutils import Vector

PALETTE = {
    'concrete': ('8e9187', .93, 0), 'chalk': ('b4ae99', .88, 0),
    'oxide': ('725345', .9, .12), 'steel': ('353e40', .69, .5),
    'glass': ('344f53', .24, .48), 'void': ('151f23', 1, 0),
    'paint': ('c5b393', .83, 0), 'ceramic': ('426364', .84, .08),
}
MATERIALS = {}
BATCHES = {}
RNG = random.Random(20332113)

def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

def initialize():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, (hexcolor, rough, metal) in PALETTE.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        rgba = tuple(linear(int(hexcolor[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        MATERIALS[name] = mat

def emit(name, verts, faces, mat, shade=1):
    """Join per building/material for bounded draw calls and frustum culling."""
    key = (name, mat)
    batch = BATCHES.setdefault(key, [[], [], []])
    start = len(batch[0])
    batch[0].extend(verts)
    batch[1].extend(tuple(start + i for i in face) for face in faces)
    # Vertex wear is exported, including darker slab undersides and water damage.
    for x, y, z in verts:
        streak = .06 * math.sin(x * 3.8 + z * 1.13)
        tide = .77 if y < 5 else 1
        c = max(.3, min(1.2, shade * tide + streak))
        batch[2].append((c, c, c, 1))

def box(name, pos, size, mat='concrete', bevel=0, tilt=0, shade=1):
    x, y, z = pos
    w, h, d = [n / 2 for n in size]
    verts = [(a*w, b*h, c*d) for a,b,c in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    verts = [(x+a*math.cos(tilt)-b*math.sin(tilt),
              y+a*math.sin(tilt)+b*math.cos(tilt), z+c) for a,b,c in verts]
    faces = [(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]
    emit(name, verts, faces, mat, shade)

def prism(name, outline, depth, z, mat='concrete', shade=1):
    n = len(outline)
    verts = [(x,y,z-depth/2) for x,y in outline] + [(x,y,z+depth/2) for x,y in outline]
    faces = [tuple(range(n-1,-1,-1)), tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    emit(name, verts, faces, mat, shade)

def beam(name, a, b, radius=.05, mat='oxide', sides=5):
    a, b = Vector(a), Vector(b)
    up = (b-a).normalized()
    right = up.cross(Vector((0,1,0)))
    if right.length < .01:
        right = up.cross(Vector((1,0,0)))
    right.normalize()
    forward = up.cross(right).normalized()
    verts = [tuple(p + radius*(right*math.cos(i*math.tau/sides)+forward*math.sin(i*math.tau/sides)))
             for p in (a,b) for i in range(sides)]
    faces = [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    faces += [tuple(range(sides-1,-1,-1)), tuple(range(sides,sides*2))]
    emit(name, verts, faces, mat)

def rubble(name, x, y, z, size=1):
    w, h = size, size*.5
    prism(name, [(x-w,y),(x-w*.6,y+h*.7),(x+w*.3,y+h),
                 (x+w,y+h*.35),(x+w*.7,y-.15)], size*.9, z, shade=RNG.uniform(.65,1))

def sign(name, text, pos, size, mat='paint', side=False):
    curve = bpy.data.curves.new(text, 'FONT')
    curve.body = text
    curve.size = size
    curve.extrude = .003
    curve.space_character = 1.12
    obj = bpy.data.objects.new(text, curve)
    bpy.context.collection.objects.link(obj)
    x,y,z = pos
    obj.location = (x,-z,y)
    obj.rotation_euler = (math.pi/2, 0, -math.pi/2 if side else 0)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    emit(name, [(v.x,v.z,-v.y) for v in verts],
         [tuple(p.vertices) for p in obj.data.polygons], mat, .9)
    bpy.data.objects.remove(obj, do_unlink=True)

def finalize():
    for (name, mat), (verts, faces, colors) in BATCHES.items():
        mesh = bpy.data.meshes.new(name+'_'+mat)
        mesh.from_pydata([(x,-z,y) for x,y,z in verts], [], faces)
        mesh.materials.append(MATERIALS[mat])
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.collection.objects.link(obj)
        color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
        for i,c in enumerate(colors):
            color.data[i].color = c
        uv = mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            n = poly.normal
            for loop_id in poly.loop_indices:
                v = mesh.vertices[mesh.loops[loop_id].vertex_index].co
                coords = (v.x,v.y) if abs(n.z) > .5 else (v.x,v.z) if abs(n.y) > .5 else (v.y,v.z)
                uv.data[loop_id].uv = (coords[0]/3.5,coords[1]/3.5)
        # Recalculate authored prism winding once before glTF export.
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.select_set(False)
