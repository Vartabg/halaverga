"""An original adversary, not a named biblical species. Anatomy, keratin and tensioned wings."""
from math import pi, sin, cos
import bpy
from mathutils import Vector
from mesh import material, surface, join, tube, sphere, mesh, paint, export
import demon_face


def build(root, sources):
    flesh = material('Cinder flesh', (.18,.065,.041), .13, .73)
    bone = material('Charred keratin', (.23,.17,.09), .38, .47)
    membrane = material('Wing membrane', (.21,.042,.027), .05, .78)
    ember = material('Ember eyes', (1,.15,.005), 0, .3)
    raw = [surface(sources['suit'], 'Demon torso anatomy', 8000, flesh), surface(sources['skin'], 'Demon face and extremities', 6500, flesh)]
    demon_face.sculpt(raw[1])
    def transform(p):
        x,y,z=p
        # Broad ribs, pinched waist, forward jaw and digitigrade rear-set ankles.
        width = 1.30+.42*max(0,1-abs(z-1.34)/.22)
        xx = x*width
        yy = y*1.7
        if z > 1.61:
            yy -= max(0,1-abs(z-1.67)/.08)*max(0,-y-.075)*.55
        zz = (z-1.04)*1.06
        if z < .80:
            zz = -.2544+(z-.80)*.75
            yy += .16*max(0,1-abs(z-.20)/.30)
        return Vector((xx,yy,zz))
    for o in raw:
        for v in o.data.vertices:
            v.co = transform(v.co)
    face,teeth=demon_face.details(flesh,bone)
    body_parts, plate_parts = raw+face, teeth
    # Four sweeping, ridged horns grow from the brow. Their radii carry fine growth rings.
    for s in [-1,1]:
        for row in range(2):
            points, radii = [], []
            for i in range(27):
                t=i/26
                points.append((s*(.09+row*.065+.19*sin(t*pi*.83)), .005+.22*t-.07*sin(t*pi), .70-row*.05+.47*t-.13*t*t))
                radii.append((.052-row*.012)*(1-t)**.8*(1+.09*sin(t*45))+.0008)
            plate_parts.append(tube('Curved crown horn', points, radii, bone, 10))
        # Shoulder spurs and overlapping dorsal scutes.
        for j in range(4):
            x=s*(.24+j*.035)
            plate_parts.append(tube('Shoulder spur', [(x,.025,.43-j*.025),(x+s*.075,.04,.53-j*.012),(x+s*.10,.08,.59-j*.005)], [.036,.021,.001], bone, 8))
        # Clawed hands extend from real fingers, with knuckles rather than disembodied cones.
        for j in range(4):
            x=s*(.55+j*.025)
            y=-.035-j*.016
            body_parts.append(tube('Long finger', [(x,y,-.026),(x+s*.032,y-.018,-.14),(x+s*.025,y-.045,-.23)], [.019,.013,.006], flesh, 7))
            plate_parts.append(tube('Hooked talon', [(x+s*.025,y-.045,-.23),(x+s*.012,y-.075,-.275),(x-s*.009,y-.087,-.27)], [.012,.007,.0005], bone, 7))
        # Sculpted facial planes around the source's actual nose, jaw and eye sockets.
        body_parts.append(tube('Brow ridge', [(s*.015,-.225,.756),(s*.055,-.245,.765),(s*.103,-.209,.732)], [.022,.025,.011], flesh, 10))
        body_parts.append(tube('Cheek ridge', [(s*.105,-.18,.71),(s*.085,-.244,.66),(s*.041,-.263,.628)], [.026,.019,.008], flesh, 10))
        for j in range(3):
            x=s*(.22+j*.035)
            plate_parts.append(tube('Foot talon',[(x,-.09,-.76),(x,-.20,-.78),(x,-.25,-.76)],[.024,.016,.001],bone,8))
    for j in range(8):
        plate_parts.append(tube('Dorsal scute',[(0,.14,.47-j*.07),(0,.21,.48-j*.07),(0,.27,.44-j*.07)],[.040,.026,.001],bone,8))
    body_parts.append(tube('Whip tail', [(0,.12,-.12),(0,.29,-.30),(.12,.45,-.48),(.26,.46,-.56),(.34,.36,-.52),(.36,.29,-.43)], [.055,.047,.033,.022,.013,.001], flesh, 10))
    # Membranes span a bent upper limb and five curved finger struts, with scalloped trailing edges.
    def wing(side):
        pieces=[]
        wrist=Vector((.82,.10,.56))
        tips=[Vector(p) for p in [(1.99,.16,.87),(1.93,.20,.21),(1.54,.23,-.28),(.97,.20,-.44),(.36,.12,-.21)]]
        root=Vector((.20,.08,.36))
        pieces.append(tube('Wing upper limb', [root,(.49,.07,.68),wrist], [.075,.057,.040], bone, 10))
        for tip in tips[:-1]:
            points=[wrist.lerp(tip,i/12)+Vector((0,-.035*sin(i/12*pi),.04*sin(i/12*pi))) for i in range(13)]
            pieces.append(tube('Wing finger', points, [.029*(1-i/13)**.7 for i in range(13)], bone, 7))
        # Each membrane panel has real depth curvature and fine branching tension creases.
        for a,b in zip(tips[:-1],tips[1:]):
            verts,faces=[],[]
            for j in range(13):
                t=j/12
                for i in range(13):
                    u=i/12
                    edge=a.lerp(b,u).lerp(wrist,.19*sin(u*pi))
                    p=wrist.lerp(edge,t)
                    p.y += .10*sin(u*pi)*sin(t*pi)+.008*sin(u*31+t*8)*t
                    verts.append(p)
                    if i<12 and j<12:
                        k=j*13+i
                        faces.append((k,k+1,k+14,k+13))
            pieces.append(mesh('Tensioned membrane',verts,faces,membrane))
        out=join(pieces,'wingL' if side<0 else 'wingR')
        # Blender export Y up converts (x,y,z) to (x,z,-y). Keep game front at -Z.
        for v in out.data.vertices:
            v.co.x *= side
            v.co.y *= -1
        if side>0:
            out.data.flip_normals()
        return out
    body=join(body_parts,'body')
    plate=join(plate_parts,'plate')
    for obj in [body,plate]:
        for v in obj.data.vertices:
            v.co.y *= -1
        obj.data.flip_normals()
    eyes=[]
    for s in [-1,1]:
        eyes.append(sphere('eye', (s*.046,.24,.737), (.023,.010,.009), ember, 12, 8))
    eyes=join(eyes,'eye')
    # Runtime positions this emissive pair at eyeCenter; all other parts are origin-centred.
    left,right=wing(-1),wing(1)
    def tone(p):
        n=.70+.14*sin(p.x*51+sin(p.z*41))*sin(p.z*63+p.y*17)
        return (n,n*.88,n*.82)
    for obj in [body,plate,left,right]:
        paint(obj,tone)
    export([body,plate,eyes,left,right],root/'public/models/abyssal.glb')
    return [body,plate,eyes,left,right]
