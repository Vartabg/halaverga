"""A patagium with shoulder/elbow/wrist support, elongated fingers and a body attachment.
Coordinates here are game X right/Y up/Z back, converted to Blender only at delivery.
"""
from math import sin,pi
from mathutils import Vector
from mesh import tube,mesh,join

ROOT=Vector((.20,.34,.09))
ELBOW=Vector((.54,.36,.26))
WRIST=Vector((.92,.37,.10))


def make(side,bone,membrane):
    pieces=[]
    tips=[Vector(p) for p in [(2.10,.35,.45),(1.95,.33,1.05),(1.50,.31,1.34),(.86,.29,1.22),(.22,-.10,.20)]]
    pieces.append(tube('Humerus and forearm',[ROOT,ROOT.lerp(ELBOW,.5),ELBOW,ELBOW.lerp(WRIST,.5),WRIST],[.066,.061,.050,.040,.033],bone,10))
    for tip in tips[:-1]:
        points=[WRIST.lerp(tip,i/12)+Vector((0,.025*sin(i/12*pi),-.022*sin(i/12*pi))) for i in range(13)]
        pieces.append(tube('Tapered wing digit',points,[.027*(1-i/13)**.75 for i in range(13)],bone,7))
    def web(a,b,origin,name,depth=.055):
        vertices,faces=[],[]
        for j in range(10):
            t=j/9
            for i in range(11):
                u=i/10
                edge=a.lerp(b,u).lerp(origin,.13*sin(u*pi))
                p=origin.lerp(edge,t)
                p.y+=depth*sin(u*pi)*sin(t*pi)+.002*sin(u*31+t*9)*t
                vertices.append(p)
                if i<10 and j<9:
                    k=j*11+i
                    faces.append((k,k+1,k+12,k+11))
        pieces.append(mesh(name,vertices,faces,membrane))
    for a,b in zip(tips[:-1],tips[1:]):
        web(a,b,WRIST,'Interdigital patagium')
    web(ROOT,tips[-1],WRIST,'Inner wing attached to flank',.025)
    web(ROOT,WRIST,ELBOW,'Leading-edge skin',.018)
    result=join(pieces,'wingL' if side<0 else 'wingR')
    for v in result.data.vertices:
        x,y,z=v.co
        v.co=(x*side,-z,y)
    if side<0:
        result.data.flip_normals()
    return result
