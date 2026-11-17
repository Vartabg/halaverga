"""Develop the facial silhouette and a recessed mouth, keeping the original anatomical eye sockets."""
from math import sin,pi
import bmesh
from mesh import tube, sphere, material


def sculpt(obj):
    # Carve an opening through the closed human lips before adding an inner mouth and hooked teeth.
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    remove=[]
    for f in bm.faces:
        p=f.calc_center_median()
        if p.y<-.113 and abs(p.x)<.040 and 1.647<p.z<1.683:
            remove.append(f)
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    for v in bm.verts:
        x,y,z=v.co
        if y<-.085 and z>1.60:
            # High temples, pinched cheeks and a projected nasal ridge.
            cheek=max(0,1-abs(z-1.70)/.06)*min(1,abs(x)/.05)
            v.co.x*=1-.17*cheek
            v.co.y+=.014*cheek
            nose=max(0,1-abs(z-1.72)/.045)*max(0,1-abs(x)/.025)
            v.co.y-=.022*nose
    bm.to_mesh(obj.data)
    bm.free()


def details(flesh,bone):
    dark=material('Mouth interior',(.012,.002,.001),0,.94)
    body=[sphere('Recessed mouth',(0,-.237,.658),(.060,.018,.027),dark,20,12)]
    teeth=[]
    for s in [-1,1]:
        for j in range(5):
            x=s*(.007+j*.010)
            length=.015+(.012 if j==3 else 0)
            teeth.append(tube('Upper tooth',[(x,-.258,.675),(x,-.270,.675-length*.6),(x*.98,-.267,.675-length)], [.005,.003,.0004],bone,7))
            teeth.append(tube('Lower tooth',[(x,-.254,.638),(x,-.265,.647),(x*.98,-.262,.654)], [.004,.0025,.0004],bone,7))
        # Long points along the mandible and swept temple spurs.
        body.append(tube('Mandibular edge',[(s*.064,-.20,.66),(s*.061,-.22,.611),(s*.023,-.247,.60)],[.018,.015,.006],flesh,10))
    return body,teeth
