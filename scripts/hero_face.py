"""A proportioned face, fitted eye openings and swept hair, authored as surfaces."""
import bpy
from math import cos, sin, pi, exp, sqrt
from suit_mesh import mesh, seam
from hero_anatomy import volume


def face():
    # Chin-to-crown is .247 m. The head is broader than the neck, not spherical.
    rings = [(.722,.034,.045,.028),(.733,.05,.06,.022),
             (.749,.067,.068,.012),(.768,.076,.075,.004),
             (.779,.078,.077,.002),(.791,.08,.08,0),
             (.808,.084,.084,-.004),(.823,.086,.087,-.006),
             (.844,.083,.087,-.007),(.858,.082,.087,-.008),
             (.878,.082,.085,-.01),(.905,.081,.082,-.014),(.937,.066,.07,-.017),
             (.952,.04,.046,-.016),(.962,.006,.008,-.014)]
    vertices, faces, steps = [], [], 64
    for z,rx,ry,cy in rings:
        for i in range(steps):
            a = 2*pi*i/steps
            x,y = rx*cos(a), cy+ry*sin(a)
            if sin(a) > 0:
                front = sin(a)**8
                nose = .035*exp(-(x/.013)**2-((z-.808)/.021)**2)
                bridge = .018*exp(-(x/.011)**2-((z-.837)/.028)**2)
                sockets = .009*exp(-((abs(x)-.034)/.016)**2-((z-.848)/.009)**2)
                lips = .007*exp(-(x/.027)**4-((z-.781)/.008)**2)
                chin = .009*exp(-(x/.034)**4-((z-.748)/.017)**2)
                y += front*(nose+bridge-sockets+lips+chin)
            vertices.append((x,y,z))
    faces.append(tuple(reversed(range(steps))))
    for row in range(len(rings)-1):
        for i in range(steps):
            j = (i+1)%steps
            faces.append((row*steps+i,row*steps+j,(row+1)*steps+j,(row+1)*steps+i))
    faces.append(tuple((len(rings)-1)*steps+i for i in range(steps)))
    head = mesh('Explorer sculpted face',vertices,faces,'skin',1,True)
    bpy.context.view_layer.objects.active = head
    sub = head.modifiers.new('Subtle facial planes','SUBSURF'); sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    head.data.calc_loop_triangles()
    dec = head.modifiers.new('Face topology budget','DECIMATE')
    dec.ratio = min(1,2800/len(head.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for s in [-1,1]:
        # Small almond-shaped openings, with only a narrow area of sclera exposed.
        volume('Eye opening',(s*.034,.077,.848),(.0048,.002,.0031),finish='eyes')
        volume('Iris',(s*.034,.0806,.848),(.003,.0013,.0028),finish='eyes')
        seam('Upper eyelid',[(s*.02,.072,.848),(s*.033,.08,.851),(s*.048,.066,.849)],'skin',1,.0018)
        volume('Human ear',(s*.081,-.013,.833),(.011,.018,.027),finish='skin')
    return head


def hair():
    vertices, faces, steps, rows = [], [], 48, 12
    for row in range(rows+1):
        t = row/rows
        for i in range(steps):
            a = 2*pi*i/steps
            front = max(0,sin(a))
            line = .823+.079*front**.35+.002*cos(3*a)
            z = line+(.981-line)*sin(t*pi/2)
            ring = sqrt(max(.0001,1-((z-.89)/.095)**2))
            x = .088*cos(a)*ring-.008*t
            y = -.014+.092*sin(a)*ring
            # Low swept ridges; the hair never becomes a cone or mohawk.
            ridge = .0035*sin(a*13+t*8)*(1-t)
            vertices.append((x*(1+ridge/.083),y+ridge*sin(a),z))
    for row in range(rows):
        for i in range(steps):
            j = (i+1)%steps
            faces.append((row*steps+i,row*steps+j,(row+1)*steps+j,(row+1)*steps+i))
    faces.append(tuple(rows*steps+i for i in range(steps)))
    return mesh('Short swept hair',vertices,faces,'hair',1,True)
