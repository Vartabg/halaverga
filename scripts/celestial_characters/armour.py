"""Continuous quad shells and body-sampled limb sections; finished silhouettes before decoration."""
from math import sin,cos,pi
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mesh import mesh, tube, apply


def shell(name,fn,nu,nv,mat):
    verts=[fn(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces=[]
    for j in range(nv):
        for i in range(nu):
            a=j*(nu+1)+i
            faces.append((a,a+1,a+nu+2,a+nu+1))
    obj=mesh(name,verts,faces,mat)
    solid=obj.modifiers.new('Rolled metal shell','SOLIDIFY')
    solid.thickness,solid.offset=.004,-1
    apply(obj,solid.name)
    return obj


def cuirass(gold,edge):
    def point(u,t):
        a=u*pi*2
        # Continuous shaped torso: bridge the sternum instead of tracing each pectoral.
        width=.146+.055*sin(t*pi*.82)
        depth=.117+.035*sin(t*pi)
        z=1.035+t*.431-.055*(1-t)**5*max(0,cos(a))
        z-=t**7*.035*abs(sin(a))**3
        return (sin(a)*width,-cos(a)*depth+.008,z)
    out=[shell('Continuous cuirass',point,64,24,gold)]
    for t in [.015,.965]:
        out.append(tube('Cuirass rolled border',[point(i/64,t) for i in range(65)],[.003]*65,edge,6))
    # A raised centre ridge and two leaf-like swept chased channels.
    out.append(tube('Cuirass keel',[(0,-.116-.035*sin(t*pi)-.001,1.035+t*.40) for t in [i/24 for i in range(25)]],[.003]*25,edge,6))
    return out


def segment(source,name,a,b,t0,t1,mat,edge,sweep=pi*2):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    right=axis.cross(Vector((0,-1,0))).normalized()
    front=right.cross(axis).normalized()
    tree=BVHTree.FromPolygons([v.co for v in source.vertices],[p.vertices for p in source.polygons])
    def point(u,v):
        angle=(u-.5)*sweep
        t=t0+(t1-t0)*v
        centre=a.lerp(b,t)
        direction=front*cos(angle)+right*sin(angle)
        hit=tree.ray_cast(centre,direction,.25)
        r=(hit[0]-centre).length if hit[0] is not None else .055
        return centre+direction*(r+.012+.002*sin(v*pi))
    obj=shell(name,point,32,8,mat)
    trims=[tube(name+' edge',[point(i/32,t) for i in range(33)],[.0022]*33,edge,6) for t in [.01,.99]]
    return [obj,*trims]
