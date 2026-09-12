"""Small original mesh primitives for a fitted suit; Blender Z-up, forward +Y."""
import bpy
from math import cos, sin, pi

MATERIALS = {}
PANELS = {}

def material(name, color, roughness, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    MATERIALS[name] = mat

def mesh(name, vertices, faces, finish, rig, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[finish])
    obj['suitPart'] = rig
    if smooth:
        for face in data.polygons:
            face.use_smooth = len(face.vertices) == 4
    return obj

def loft(name, rings, finish, rig=0, x=0, y=0, segments=20):
    """Closed elliptical loft. Rings are z, x-radius, y-radius; z increases."""
    vertices = [(x + rx*cos(a*2*pi/segments), y + ry*sin(a*2*pi/segments), z)
                for z, rx, ry in rings for a in range(segments)]
    faces = [tuple(reversed(range(segments)))]
    for r in range(len(rings)-1):
        for a in range(segments):
            b = (a+1) % segments
            faces.append((r*segments+a, r*segments+b, (r+1)*segments+b, (r+1)*segments+a))
    faces.append(tuple((len(rings)-1)*segments+a for a in range(segments)))
    return mesh(name, vertices, faces, finish, rig, True)

def panel(name, points, finish, rig=0, depth=.012):
    """Contoured polygon with a narrow manufactured edge; points are x,y,z."""
    direction = 1 if sum(p[1] for p in points) >= 0 else -1
    points = [(x,y+direction*.01,z) for x,y,z in points]
    n = len(points)
    verts = points + [(x, y-depth*direction, z) for x,y,z in points]
    # A shallow raised centre clears the curved sleeve beneath. A single nonplanar
    # ngon would cut through the underlayer when the exporter triangulates it.
    centre = (sum(p[0] for p in points)/n,
              direction*(max(abs(p[1]) for p in points)+.008),
              sum(p[2] for p in points)/n)
    verts.append(centre)
    faces = [(i,(i+1)%n,2*n) for i in range(n)]
    faces.append(tuple(reversed(range(n,2*n))))
    faces += [((i+1)%n,i,i+n,(i+1)%n+n) for i in range(n)]
    normal_y = sum(points[i][2]*points[(i+1)%n][0]-points[i][0]*points[(i+1)%n][2] for i in range(n))
    if normal_y*direction < 0:
        faces = [tuple(reversed(face)) for face in faces]
    obj = mesh(name, verts, faces, finish, rig)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bevel = obj.modifiers.new('Precision edge', 'BEVEL')
    bevel.width = .005; bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.select_set(False)
    obj.data.calc_loop_triangles()
    PANELS.setdefault(rig, []).extend(
        [[tuple(obj.data.vertices[i].co) for i in face.vertices] for face in obj.data.loop_triangles])
    return obj

def surface_points(points, rig):
    """Project fine inlays onto the authored plates so they never sink into them."""
    triangles = PANELS.get(rig, [])
    if not triangles: return points
    sampled = []
    for a, b in zip(points, points[1:]):
        for step in range(5): sampled.append(tuple(a[i]+(b[i]-a[i])*step/5 for i in range(3)))
    sampled.append(points[-1])
    result = []
    for x, y, z in sampled:
        direction = 1 if y >= 0 else -1
        outer = y*direction
        for a, b, c in triangles:
            denominator = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
            if abs(denominator) < 1e-9: continue
            u = ((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator
            v = ((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator
            if u < 0 or v < 0 or u+v > 1: continue
            height = (u*a[1]+v*b[1]+(1-u-v)*c[1])*direction
            outer = max(outer,height+.001)
        result.append((x,outer*direction,z))
    return result

def seam(name, points, finish, rig=0, radius=.004):
    points = surface_points(points, rig)
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'; curve.resolution_u = 1
    curve.bevel_depth = radius; curve.bevel_resolution = 1
    spline = curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for point, xyz in zip(spline.points, points): point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[finish]); obj['suitPart'] = rig
    return obj

def visor():
    # Continuous swept lens follows the face instead of a box attached to it.
    vertices, faces, steps = [], [], 24
    for z, rx, ry in [(.738,.124,.145),(.755,.139,.160),(.818,.143,.162),(.843,.132,.148)]:
        for i in range(steps+1):
            a = pi*.06 + pi*.88*i/steps
            vertices.append((rx*cos(a), ry*sin(a)+.009, z))
    for row in range(3):
        for i in range(steps):
            a = row*(steps+1)+i
            faces.append((a,a+1,a+steps+2,a+steps+1))
    obj = mesh('Visor continuous lens', vertices, faces, 'visor', 1, True)
    obj.data.materials[0].use_backface_culling = False
    seam('Visor brow signal', [(x,y+.001,z+.002) for x,y,z in vertices[-25:]], 'energy', 1, .002)
