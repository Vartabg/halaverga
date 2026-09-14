"""Sculptural swept locks: actual tapered volumes, not a textured spherical cap."""
import bpy
from math import sin,cos,pi,atan2,exp
from mathutils import Vector
from common import mesh


def catmull(points,t):
    n = len(points)-1
    p = min(n-1,int(t*n)); f = min(1,t*n-p)
    a,b,c,d = [points[max(0,min(n,j))] for j in [p-1,p,p+1,p+2]]
    return .5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)


def lock(name,points,width,depth,material):
    points = [Vector(p) for p in points]
    vertices,faces,rows,sides = [],[],22,8
    for row in range(rows+1):
        t = row/rows
        p = catmull(points,t)
        tangent = (catmull(points,min(1,t+.005))-catmull(points,max(0,t-.005))).normalized()
        side = tangent.cross(Vector((0,0,1)))
        if side.length<.01: side = Vector((1,0,0))
        side.normalize(); up = side.cross(tangent).normalized()
        taper = (.28+.72*sin(pi*t)**.45)*(1-.8*t**5)
        for j in range(sides):
            a = j*2*pi/sides
            vertices.append(p+side*cos(a)*width*taper+up*sin(a)*depth*taper)
    for row in range(rows):
        for j in range(sides):
            k=(j+1)%sides; faces.append((row*sides+j,row*sides+k,(row+1)*sides+k,(row+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple(rows*sides+j for j in range(sides))])
    return mesh(name,vertices,faces,material)


def scalp_foundation(body,material):
    """Extract fitted anatomical scalp faces; no primitive head/cap substitute."""
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    vertices = [body.matrix_world@v.co for v in data.vertices]
    def covered(p):
        if p.y<-.065: return p.z>1.928-.042*min(1,abs(p.x)/.092)**2
        if p.y<.0: return p.z>1.872
        return p.z>1.805+.040*min(1,abs(p.x)/.09)
    selected = [p for p in data.polygons if all(covered(vertices[i]) for i in p.vertices)]
    ids = sorted({i for p in selected for i in p.vertices}); indices = {v:i for i,v in enumerate(ids)}
    result = []
    for i in ids:
        p = vertices[i]; normal = body.matrix_world.to_3x3()@data.vertices[i].normal
        result.append(p+normal*(.005+.008*exp(-((p.z-1.962)/.035)**2)))
    mesh('Hair foundation - extracted anatomical scalp',result,
         [tuple(indices[i] for i in p.vertices) for p in selected],material)
    evaluated.to_mesh_clear()


def build_hair(tailor,material,body,revision=0):
    # Lock roots follow the same fitted head used for the proof body.
    surface = tailor.surface
    def on_head(x,y,z,lift):
        start = Vector((x,y,z)); center = Vector((0,.01 if revision==0 else -.025,1.855))
        direction = (start-center).normalized()
        hit,normal,_,_ = surface.ray_cast(center+direction*.35,-direction)
        if hit is None: raise ValueError('Hair guide missed the fitted head.')
        return hit+normal*lift
    if revision >= 1:
        scalp_foundation(body,material)
        for i in range(30):
            x = -.088+i*.0061
            rootz = 1.934-.035*(abs(x)/.09)**1.6+.003*sin(i*2.4)
            sweep = -.029-.012*sin(i*.65)
            guides = [on_head(x,-.12,rootz,.007),
                      on_head(x+sweep,-.103,rootz+.029,.009+.004*sin(i*.9)**2),
                      on_head(x+sweep*1.3,-.052,1.978,.012),
                      on_head(x+sweep*.6,.028,1.976,.010),
                      on_head(x*.8,.089,1.899,.004)]
            lock('Asymmetric swept crown clump %02d'%i,guides,.007+.002*sin(i*1.8)**2,.0038,material)
        for side in [-1,1]:
            for i in range(24):
                z=1.857+i*.0048
                guides=[on_head(side*.091,-.070,z,.006),
                        on_head(side*.104,-.028,z+.013,.006),
                        on_head(side*.095,.038,z+.004,.007),
                        on_head(side*.065,.095,z-.032,.004)]
                lock('Layered temple sweep',guides,.0055,.0025,material)
        for i in range(25):
            x=-.085+i*.0071
            lock('Layered nape sweep',[on_head(x,.065,1.944,.008),
                 on_head(x+.012*sin(i),.110,1.872,.007),
                 on_head(x*.80,.082,1.808,.005)],.0058,.003,material)
        if revision >= 2:
            # Break the slick continuous crown outline with uneven forelocks.
            for i in range(11):
                x=-.072+i*.010
                guides=[on_head(x+.022,-.123,1.922,.008),
                        on_head(x+.006,-.098,1.971,.016+.007*sin(i*1.3)**2),
                        on_head(x-.030,-.041,1.991,.023),
                        on_head(x-.052,.018,1.962,.009)]
                lock('Loose swept forelock',guides,.0058,.0035,material)
        return
    for i in range(22):
        x = -.083+i*.0076
        rootz = 1.902-.03*(abs(x)/.085)**1.5
        guides = [on_head(x,-.105,rootz,.004),
                  on_head(x-.018,-.075,1.969,.019),
                  on_head(x-.026,-.004,1.99,.025),
                  on_head(x-.018,.075,1.949,.011),
                  on_head(x*.88,.093,1.891,.005)]
        lock('Swept crown lock %02d'%i,guides,.006,.0045,material)
    for side in [-1,1]:
        for i in range(14):
            a = -.95+i*.14
            roots = [on_head(side*.09,-.049+i*.008,1.847,.004),
                     on_head(side*.096,-.036+i*.008,1.891,.007),
                     on_head(side*.091,.012+i*.006,1.908,.007),
                     on_head(side*.071,.074+i*.002,1.832,.003)]
            lock('Swept temple lock',roots,.0052,.0028,material)
    for i in range(17):
        x=-.075+i*.0094
        guides = [on_head(x,.073,1.944,.007),on_head(x,.108,1.889,.006),on_head(x,.094,1.794,.003)]
        lock('Tapered nape lock',guides,.006,.0035,material)
