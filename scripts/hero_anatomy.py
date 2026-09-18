"""Reference-led explorer anatomy. Metres, Z-up, facing +Y (glTF -Z)."""
import bpy
from math import cos, sin, pi, radians
from suit_mesh import mesh, MATERIALS


def volume(name, location, scale, rotation=(0, 0, 0), finish='textile'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = tuple(radians(a) for a in rotation)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(MATERIALS[finish])
    for face in obj.data.polygons: face.use_smooth = True
    return obj


def column(name, rings, finish='textile', steps=24):
    """Each ring is (height, horizontal centre, depth centre, width, depth)."""
    vertices = [(x+rx*cos(i*2*pi/steps), y+ry*sin(i*2*pi/steps), z)
                for z,x,y,rx,ry in rings for i in range(steps)]
    faces = [tuple(reversed(range(steps)))]
    for r in range(len(rings)-1):
        for i in range(steps):
            j = (i+1)%steps
            faces.append((r*steps+i,r*steps+j,(r+1)*steps+j,(r+1)*steps+i))
    faces.append(tuple((len(rings)-1)*steps+i for i in range(steps)))
    obj = mesh(name, vertices, faces, finish, 0, True)
    bpy.context.view_layer.objects.active = obj
    sub = obj.modifiers.new('Flowing anatomical contours', 'SUBSURF')
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return obj


def anatomy():
    pieces = [column('Continuous technical undersuit', [
        (-.07,0,0,.08,.081),(-.045,0,0,.151,.105),
        (.045,0,-.004,.165,.112),(.13,0,0,.145,.102),
        (.24,0,0,.147,.104),(.35,0,0,.18,.116),
        (.46,0,0,.22,.13),(.535,0,0,.224,.12),
        (.585,0,0,.178,.086),(.626,0,0,.075,.063),
        (.69,0,0,.059,.06),(.731,0,0,.057,.059)])]
    for s in [-1,1]:
        pieces.append(volume('Shoulder transition', (s*.239,0,.527), (.076,.086,.093)))
        # Shoulder-to-elbow .34 m, elbow-to-wrist .29 m. No biceps spheres.
        pieces.append(column('Arm fitted sleeve', [
            (-.115,s*.325,0,.033,.027),(-.072,s*.324,0,.035,.033),
            (.015,s*.319,0,.041,.047),(.095,s*.313,0,.052,.054),
            (.167,s*.308,0,.051,.051),(.221,s*.301,0,.044,.046),
            (.28,s*.294,0,.054,.059),(.382,s*.279,0,.063,.065),
            (.477,s*.262,0,.069,.072),(.55,s*.237,0,.058,.067)]))
        pieces.append(column('Athletic leg', [
            (-.949,s*.11,-.006,.039,.046),(-.877,s*.11,-.004,.041,.053),
            (-.79,s*.113,-.012,.05,.063),(-.687,s*.117,-.025,.065,.078),
            (-.586,s*.119,-.007,.059,.063),(-.515,s*.119,.008,.058,.062),
            (-.44,s*.116,.007,.066,.074),(-.322,s*.11,0,.083,.094),
            (-.185,s*.10,-.002,.096,.109),(-.074,s*.091,-.005,.095,.107),
            (.019,s*.088,-.012,.083,.091)]))
        # Fitted gloves: palm plus separated, gently curled fingers; modest thumbs.
        pieces.append(column('Glove palm', [
            (-.164,s*.328,.006,.035,.024),(-.143,s*.328,.005,.041,.027),
            (-.093,s*.325,0,.035,.029),(-.066,s*.324,0,.033,.031)]))
        for n, length in enumerate([.055,.07,.066,.049]):
            x = s*(.301+n*.019)
            pieces.append(column('Glove finger', [
                (-.153-length,x,.026,.0065,.009),
                (-.144-length*.8,x,.026,.009,.011),
                (-.157,x,.014,.0095,.012),
                (-.139,x,.007,.009,.015)], steps=12))
        pieces.append(volume('Glove thumb', (s*.288,.018,-.133), (.014,.02,.039), (9,s*24,0)))
        # A 26 cm boot, with a real heel and a low toe box.
        pieces.append(volume('Boot heel', (s*.11,-.024,-.947), (.048,.059,.052)))
        pieces.append(volume('Boot instep', (s*.11,.061,-.945), (.052,.113,.055), (-8,0,0)))
        pieces.append(volume('Boot toe box', (s*.11,.149,-.965), (.055,.059,.029)))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces: obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = 'Explorer continuous undersuit'
    remesh = body.modifiers.new('Watertight connected body', 'REMESH')
    remesh.mode = 'VOXEL'; remesh.voxel_size = .006
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    relax = body.modifiers.new('Relax silhouette joins', 'SMOOTH')
    relax.factor = .65; relax.iterations = 5
    bpy.ops.object.modifier_apply(modifier=relax.name)
    body.data.calc_loop_triangles()
    decimate = body.modifiers.new('Browser body budget', 'DECIMATE')
    decimate.ratio = min(1, 5400/len(body.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for polygon in body.data.polygons: polygon.use_smooth = True
    return body
