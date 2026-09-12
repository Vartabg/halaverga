"""Original athletic anatomy. Author in Blender Z-up, facing +Y (glTF -Z)."""
import bpy
from math import radians
from suit_mesh import loft, MATERIALS


def volume(name, location, scale, rotation=(0, 0, 0), finish='ceramic'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = tuple(radians(a) for a in rotation)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(MATERIALS[finish])
    return obj


def anatomy():
    pieces = []
    def mass(name, p, s, r=(0, 0, 0)):
        pieces.append(volume(name, p, s, r))
    pieces.append(loft('Core silhouette', [(-.24,.102,.09),(-.18,.157,.115),
        (-.09,.176,.115),(.02,.148,.10),(.14,.157,.111),(.27,.19,.126),
        (.38,.237,.139),(.48,.255,.129),(.55,.21,.105),(.595,.107,.077)], 'ceramic', segments=28))
    mass('Neck', (0,0,.621), (.067,.074,.106))
    # Eight-head proportions; the jaw, nose and ears make front/back unmistakable.
    mass('Cranium', (0,-.007,.842), (.102,.104,.132))
    mass('Jaw', (0,.024,.756), (.082,.08,.078))
    mass('Chin', (0,.072,.723), (.046,.053,.026))
    mass('Face plane', (0,.067,.805), (.078,.059,.085))
    mass('Nose bridge', (0,.119,.807), (.018,.03,.046), (-10,0,0))
    mass('Nose tip', (0,.142,.786), (.024,.026,.017))
    mass('Upper lip', (0,.122,.757), (.034,.009,.007))
    mass('Lower lip', (0,.122,.745), (.032,.009,.007))
    for s in [-1,1]:
        mass('Brow ridge', (s*.044,.109,.842), (.044,.022,.017), (0,s*8,0))
        mass('Cheekbone', (s*.055,.10,.787), (.031,.028,.028))
        mass('Ear', (s*.103,-.003,.805), (.018,.022,.04))
        # Broad chest, tapering lats, clavicles, abdominals, glutes and scapulae.
        mass('Pectoral', (s*.113,.119,.429), (.13,.037,.083), (0,s*-9,0))
        mass('Clavicle', (s*.134,.064,.544), (.135,.041,.029), (0,s*8,0))
        mass('Trapezius', (s*.11,-.025,.555), (.122,.078,.049), (0,s*18,0))
        mass('Scapula', (s*.113,-.095,.441), (.102,.05,.088))
        mass('Glute', (s*.078,-.085,-.14), (.083,.041,.093))
        for z, width in [(.29,.063),(.202,.060),(.12,.053)]:
            mass('Abdominal plane', (s*.053,.102,z), (width,.014,.043))
        mass('Oblique', (s*.126,.031,.12), (.041,.092,.145), (0,s*-9,0))
        pieces.append(loft('Arm continuity', [(-.28,.034,.038),(-.20,.043,.047),(-.09,.055,.058),(.04,.052,.056),(.16,.061,.067),(.31,.07,.075),(.45,.065,.073),(.50,.04,.049)], 'ceramic', x=s*.325, segments=20))
        pieces.append(loft('Leg continuity', [(-.956,.037,.041),(-.84,.045,.05),(-.72,.055,.059),(-.61,.056,.059),(-.51,.066,.076),(-.35,.078,.09),(-.19,.071,.079)], 'ceramic', x=s*.119, segments=20))
        mass('Deltoid', (s*.286,0,.47), (.092,.098,.105))
        mass('Upper arm', (s*.325,0,.283), (.069,.073,.18), (0,s*3,0))
        mass('Biceps', (s*.325,.039,.272), (.069,.058,.122))
        mass('Triceps', (s*.322,-.035,.295), (.069,.062,.139))
        mass('Elbow', (s*.325,-.008,.046), (.055,.058,.061))
        mass('Forearm', (s*.325,.004,-.108), (.056,.061,.161), (-4,0,s*-1))
        mass('Brachioradialis', (s*.35,.014,-.055), (.038,.055,.10), (0,s*7,0))
        mass('Wrist', (s*.326,.013,-.258), (.036,.04,.054))
        mass('Fist palm', (s*.332,.012,-.332), (.046,.046,.065))
        for n in range(4):
            mass('Curled finger', (s*(.306+n*.017),.044,-.351), (.011,.032,.029))
            mass('Knuckle', (s*(.306+n*.017),.048,-.328), (.012,.025,.017))
        mass('Thumb', (s*.293,.036,-.319), (.019,.026,.042), (0,s*20,0))
        mass('Thigh', (s*.111,-.005,-.376), (.086,.099,.228), (-3,s*-2,0))
        mass('Quadriceps', (s*.126,.04,-.362), (.072,.088,.165))
        mass('Inner quad', (s*.085,.043,-.514), (.048,.058,.082))
        mass('Knee', (s*.119,.004,-.612), (.059,.065,.067))
        mass('Patella', (s*.119,.057,-.612), (.042,.024,.039))
        mass('Shin', (s*.119,.004,-.789), (.047,.053,.163))
        mass('Calf', (s*.119,-.033,-.73), (.064,.073,.114))
        mass('Ankle', (s*.119,.001,-.923), (.039,.047,.065))
        mass('Heel', (s*.119,-.018,-.976), (.046,.058,.048))
        mass('Instep', (s*.119,.068,-.968), (.05,.102,.052), (-10,0,0))
        mass('Toes', (s*.119,.13,-.987), (.053,.066,.027))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces: obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = 'Human continuous suit'
    remesh = body.modifiers.new('Fuse anatomical volumes', 'REMESH')
    remesh.mode = 'VOXEL'; remesh.voxel_size = .007; remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = body.modifiers.new('Relax sculpt joins', 'SMOOTH')
    smooth.factor = 1.1; smooth.iterations = 10
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    body.data.calc_loop_triangles()
    decimate = body.modifiers.new('Browser topology', 'DECIMATE')
    decimate.ratio = min(1, 10500 / len(body.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for polygon in body.data.polygons: polygon.use_smooth = True
    return body
