"""Fitted, original ceremonial armour, layered lames, pteruges and embroidered cloth."""
from math import sin, cos, pi
from mesh import mesh, tube, apply, sphere
from outfit_shapes import cut, axis_param, ARM, LEG, boot
import armour


def fitted(source, name, keep, lift, mat, out):
    o = cut(source, name, keep, lift, (1, 1, 1, 1), smooth=10)
    o.data.materials.append(mat)
    dec = o.modifiers.new('Plate budget', 'DECIMATE')
    dec.ratio = min(1, 550/max(1, sum(len(p.vertices)-2 for p in o.data.polygons)))
    apply(o, dec.name)
    solid = o.modifiers.new('Folded metal edge', 'SOLIDIFY')
    solid.thickness, solid.offset = .005, -.3
    apply(o, solid.name)
    bevel = o.modifiers.new('Soft hammered edge', 'BEVEL')
    bevel.width, bevel.segments = .002, 2
    apply(o, bevel.name)
    for p in o.data.polygons:
        p.use_smooth = True
    out.append(o)
    return o


def panel(name, fn, nu, nv, mat):
    verts = [fn(i/nu, j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j*(nu+1)+i
            faces.append((a, a+1, a+nu+2, a+nu+1))
    return mesh(name, verts, faces, mat)


def make(suit, skin, gold, edge, ivory, crimson, leather):
    parts = armour.cuirass(gold,edge)
    for s in (-1, 1):
        for j in range(3):
            parts+=armour.segment(suit,'Shoulder lame',ARM[s][0],ARM[s][1],-.10+j*.10,.11+j*.10,gold,edge,pi*1.72)
        hip, knee, ankle = LEG[s]
        elbow, wrist = ARM[s][1:]
        parts+=armour.segment(suit,'Vambrace',elbow,wrist,.16,.79,gold,edge,pi*1.5)
        parts+=armour.segment(suit,'Greave',knee,ankle,.11,.83,gold,edge,pi*1.25)
        parts+=armour.segment(suit,'Knee fan',hip,knee,.88,1.04,gold,edge,pi*.92)
        shoe = boot(suit, skin, s)
        shoe.data.materials.append(leather)
        for p in shoe.data.polygons:
            p.use_smooth=True
        parts.append(shoe)
    # Leather skirt straps (pteruges), hanging in two offset overlapping rows.
    for row in range(2):
        for j in range(14):
            a = j/14*pi*2+row*.12
            def point(u, t, a=a, row=row):
                angle = a+(u-.5)*.39
                radius = .164+.038*t
                return (sin(angle)*radius, -cos(angle)*(.125+.026*t), .995-row*.053-t*(.22+.025*cos(a*3)))
            parts.append(panel('Layered pteruges', point, 4, 6, ivory if row else crimson))
            trim = [point(u, .98) for u in [i/8 for i in range(9)]]
            parts.append(tube('Pteruges gilt hem', trim, [.002]*9, edge, 5))
    # Long split linen panels with modeled pleats, inside the skirt rather than an apron stuck to the chest.
    for s in (-1, 1):
        def cloth(u, t, s=s):
            x = s*(.016+u*(.12+.026*t))
            return (x, -.132-.015*t-.012*sin(u*pi*5)*(t*.6+.4), 1.01-.56*t+.02*sin(u*pi)*t*t)
        parts.append(panel('Split pleated linen', cloth, 18, 16, ivory))
        for u in [.04, .94]:
            parts.append(tube('Embroidered linen border', [cloth(u, i/20) for i in range(21)], [.0018]*21, edge, 5))
    # A narrow crimson mantle reveals the back armour and both wing roots.
    for s in (-1, 1):
        def mantle(u, t, s=s):
            return (s*(.13+(.08+.025*t)*(u-.5)), .094+.12*t+.012*sin(u*pi*6+t*3), 1.46-.89*t+.018*cos(u*pi*2)*t)
        parts.append(panel('Crimson mantle', mantle, 14, 24, crimson))
        for u in [.02,.98]:
            parts.append(tube('Mantle gilt piping', [mantle(u,i/24) for i in range(25)], [.002]*25, edge, 5))
        parts.append(sphere('Mantle clasp', (s*.122,-.105,1.454), (.021,.009,.021), edge))
    # Chased metal decoration follows the actual front of the breastplate.
    for s in (-1,1):
        for j in range(5):
            points = [(s*(.018+t*.13), -.151+.95*(t*.13)**2, 1.25+j*.032+.028*sin(t*pi)) for t in [i/20 for i in range(21)]]
            parts.append(tube('Chased breastplate rib', points, [.0018]*21, edge, 5))
        for j in range(7):
            a=j/6*pi*.85
            parts.append(sphere('Cuirass rivet', (s*(.028+.11*sin(a)), -.141, 1.24+.17*cos(a)), (.003,.002,.003), edge, 8, 6))
    return parts
