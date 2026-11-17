"""Original celestial asset tools. Metres, Blender Z up, front -Y before binding."""
from math import pi, sin, cos
import bpy
from mathutils import Vector


def material(name, color, metal=0, rough=.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    return m


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    for p in data.polygons:
        p.use_smooth = True
    return obj


def tube(name, points, radii, mat, sides=8):
    points = [Vector(p) for p in points]
    verts, faces = [], []
    for i, p in enumerate(points):
        tangent = points[min(i+1, len(points)-1)]-points[max(0, i-1)]
        tangent.normalize()
        axis = tangent.cross(Vector((0, 1, 0)))
        if axis.length < .01:
            axis = tangent.cross(Vector((1, 0, 0)))
        axis.normalize()
        other = tangent.cross(axis).normalized()
        for j in range(sides):
            angle = 2*pi*j/sides
            verts.append(p+(axis*cos(angle)+other*sin(angle))*radii[i])
        if i:
            for j in range(sides):
                a = (i-1)*sides+j
                b = (i-1)*sides+(j+1)%sides
                faces.append((a, b, b+sides, a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(points)-1)*sides+j for j in range(sides))])
    return mesh(name, verts, faces, mat)


def sphere(name, centre, scale, mat, segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=centre)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.transform(o.matrix_world)
    o.matrix_world.identity()
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def apply(obj, name):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=name)


def surface(source, name, target, mat):
    data = bpy.data.meshes.new_from_object(source.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    data.transform(source.matrix_world)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.clear()
    data.materials.append(mat)
    count = sum(len(p.vertices)-2 for p in data.polygons)
    if count > target:
        dec = obj.modifiers.new('Silhouette budget', 'DECIMATE')
        dec.ratio = target/count
        dec.use_collapse_triangulate = True
        apply(obj, dec.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    # Every vertex has already been baked into the same source space.
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()
    return obj


def paint(obj, color):
    attr = obj.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for poly in obj.data.polygons:
        for i in poly.loop_indices:
            attr.data[i].color = (*color(obj.data.vertices[obj.data.loops[i].vertex_index].co), 1)
    obj.data.color_attributes.active_color = attr


def export(objects, target, skins=False):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
        export_animations=False, export_skins=skins, export_yup=True, export_apply=False,
        export_materials='EXPORT', export_texcoords=False, export_normals=True)
