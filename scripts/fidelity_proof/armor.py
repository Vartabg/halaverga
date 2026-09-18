"""Trace panel borders in reference pixels, then conform them to actual anatomy."""
import bpy
import numpy as np
from math import cos, sin, pi
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from common import mesh, pixel


class Tailor:
    def __init__(self,body,material,revision=0):
        deps = bpy.context.evaluated_depsgraph_get()
        evaluated = body.evaluated_get(deps)
        data = evaluated.to_mesh()
        vertices = [body.matrix_world@v.co for v in data.vertices]
        self.surface = BVHTree.FromPolygons(vertices,[list(p.vertices) for p in data.polygons])
        evaluated.to_mesh_clear()
        self.material = material
        self.revision = revision

    def surface_point(self,x,z,back=False,offset=.006):
        start = Vector((x,2 if back else -2,z))
        direction = Vector((0,-1 if back else 1,0))
        hit,normal,_,_ = self.surface.ray_cast(start,direction)
        if hit is None:
            # A traced outer plate edge can sit just beyond the underlying body.
            hit,normal,_,_ = self.surface.find_nearest(Vector((x,.03 if back else -.03,z)))
        if self.revision >= 1:
            # Preserve traced X/Z instead of collapsing an off-body edge onto a
            # different body part. Depth alone comes from the anatomical surface.
            return Vector((x,hit.y+(offset if back else -offset),z))
        return hit+normal*offset

    def patch(self,name,border,back=False,offset=.007,thickness=.004):
        points = [pixel(x,y,'back' if back else 'front') for x,y in border]
        if back: points = [(-x,z) for x,z in points]
        if self.revision >= 1:
            points = [(a[0]*(1-t/5)+b[0]*t/5,a[1]*(1-t/5)+b[1]*t/5)
                      for a,b in zip(points,points[1:]+points[:1]) for t in range(5)]
        center = (sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points))
        n,rows = len(points),7
        vertices = [self.surface_point(*center,back,offset)]
        for row in range(1,rows+1):
            t = row/rows
            for x,z in points:
                vertices.append(self.surface_point(center[0]*(1-t)+x*t,center[1]*(1-t)+z*t,back,offset))
        if self.revision >= 2:
            # The second review exposed abrupt ray-depth changes at silhouettes.
            # Fit a continuous curved sheet to those sampled anatomical depths.
            samples=np.array(vertices); u=samples[:,0]-center[0]; v=samples[:,2]-center[1]
            design=np.column_stack([u*0+1,u,v,u*u,u*v,v*v])
            depths=samples[:,1]; median=np.median(depths)
            clipped=np.clip(depths,median-.045,median+.045)
            fitted=design@np.linalg.lstsq(design,clipped,rcond=None)[0]
            for point,depth in zip(vertices,fitted): point.y=float(depth)+(.003 if back else -.003)
        faces = [(0,1+i,1+(i+1)%n) for i in range(n)]
        for row in range(rows-1):
            a,b = 1+row*n,1+(row+1)*n
            for i in range(n): faces.append((a+i,b+i,b+(i+1)%n,a+(i+1)%n))
        if not back: faces = [tuple(reversed(f)) for f in faces]
        obj = mesh(name,vertices,faces,self.material)
        expected=Vector((0,1 if back else -1,0))
        if obj.data.polygons[0].normal.dot(expected)<0: obj.data.flip_normals()
        solid = obj.modifiers.new('Physical plate thickness','SOLIDIFY'); solid.thickness = thickness
        bevel = obj.modifiers.new('Small manufactured edge','BEVEL'); bevel.width = .0012; bevel.segments = 3
        obj['traced_border_pixels'] = str(border)
        return obj

    def collar(self):
        vertices,faces,n = [],[],64
        for row in range(4):
            t = row/3
            for i in range(n):
                angle = i*2*pi/n
                front = max(0,-sin(angle))
                bottom = 1.638+.016*max(0,sin(angle))
                top = 1.748-.046*front**5
                if self.revision >= 1:
                    bottom = 1.660+.010*max(0,sin(angle))
                    top = 1.735-.046*front**4
                z = bottom*(1-t)+top*t
                direction = Vector((cos(angle),sin(angle),0))
                hit,normal,_,_ = self.surface.ray_cast(Vector((0,0,z)),direction)
                if hit is None: raise ValueError('Collar ray did not intersect the fitted neck.')
                vertices.append(hit+normal*(.005+(1-t)*.003))
        for row in range(3):
            for i in range(n):
                j = (i+1)%n; faces.append((row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i))
        obj = mesh('Fitted open-front collar',vertices,faces,self.material)
        solid = obj.modifiers.new('Collar lining thickness','SOLIDIFY'); solid.thickness = .003
        bevel = obj.modifiers.new('Collar edge radius','BEVEL'); bevel.width = .0015; bevel.segments = 3

    def shoulder(self,side):
        # Wrap front-to-back around the actual deltoid, with the concept's upper
        # and lower silhouette heights. This is not a floating frontal plate.
        center = Vector((side*.211,-.008,1.556))
        vertices,faces = [],[]
        rows,columns = 18,32
        for row in range(rows+1):
            t=row/rows
            for col in range(columns+1):
                angle=-1.52+3.04*col/columns
                theta=.15+t*(1.68+.12*cos(angle))
                direction=Vector((side*sin(theta)*cos(angle),sin(theta)*sin(angle),cos(theta)))
                hit,normal,_,_=self.surface.ray_cast(center+direction*.4,-direction)
                if hit is None: raise ValueError('Wrapped deltoid guide missed anatomy.')
                vertices.append(hit+normal*.009)
        for row in range(rows):
            for col in range(columns):
                a=row*(columns+1)+col
                faces.append((a,a+1,a+columns+2,a+columns+1))
        obj=mesh('Continuous wrapped deltoid '+str(side),vertices,faces,self.material)
        solid=obj.modifiers.new('Shoulder shell thickness','SOLIDIFY'); solid.thickness=.004
        bevel=obj.modifiers.new('Shoulder edge radius','BEVEL'); bevel.width=.0015; bevel.segments=3


def build_armor(body,material,revision=0):
    tailor = Tailor(body,material,revision)
    tailor.collar()
    front = [
        ('Angular chest plate',[(151,185),(177,194),(204,201),(216,217),(215,253),(195,269),(147,237),(146,210)],.011),
        ('Pectoral lower overlapping flange',[(146,244),(195,280),(218,262),(218,276),(196,292),(146,256)],.010),
        ('Clavicle strip',[(155,164),(173,160),(196,176),(190,187),(166,178),(151,182)],.008),
        ('Wrapped shoulder cap',[(96,182),(126,174),(145,187),(142,211),(113,235),(88,246),(88,218)],.007),
        ('Shoulder lower overlap',[(89,245),(113,235),(110,251),(82,283),(77,282)],.006),
        ('Under-chest bridge',[(146,266),(168,281),(181,292),(175,305),(157,291),(142,278)],.007),
        ('Abdominal tailoring panel',[(181,306),(216,297),(219,401),(198,407),(179,350)],.003),
        ('Hip silhouette block',[(151,373),(179,389),(177,412),(149,398)],.006),
        ('Forearm silhouette block',[(57,350),(70,363),(58,412),(38,441),(29,439),(37,397)],.009),
        ('Thigh silhouette block',[(153,439),(182,456),(184,548),(160,595),(136,571),(135,481)],.009),
        ('Knee silhouette block',[(149,629),(174,646),(173,681),(153,696),(139,681),(134,651)],.008),
        ('Shin silhouette block',[(138,692),(164,700),(155,809),(140,846),(119,843),(124,759)],.008),
    ]
    for name,border,offset in front:
        if revision >= 1 and name=='Wrapped shoulder cap': continue
        if revision >= 2 and name=='Shoulder lower overlap': continue
        for side in [-1,1]:
            reflected = border if side<0 else [(466-x,y) for x,y in border]
            tailor.patch(name+(' L' if side<0 else ' R'),reflected,offset=offset)
    if revision >= 1:
        for side in [-1,1]: tailor.shoulder(side)
    tailor.patch('Central sternum rail',[(225,197),(241,197),(241,278),(233,285),(225,278)],offset=.005)
    for y in [204,229,254]:
        tailor.patch('Unlit inset channel',[(230,y),(236,y),(236,y+15),(230,y+15)],offset=.009,thickness=.001)
    for side in [-1,1]:
        border = [(860,169),(883,157),(923,178),(934,267),(913,301),(870,260)]
        if side>0: border = [(1902-x,y) for x,y in border]
        tailor.patch('Rear upper armor',border,back=True,offset=.010)
    for y,w in [(168,14),(230,12),(289,10)]:
        tailor.patch('Rear spine block',[(951-w,y),(951+w,y),(951+w,y+45),(951,y+53),(951-w,y+45)],back=True,offset=.016)
    return tailor
