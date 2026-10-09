"""Low-detail, authored ruins beyond the flight boundary, with a split relay landmark."""
import math
import random
from mesh import box, prism, beam, emit

def skyline():
    rng = random.Random(2113)
    name = 'horizon'
    for i in range(22):
        x = (i-10.5)*18
        if abs(x) < 24:
            continue
        z = -225-(i%4)*18
        h = 24+(i*17%43)
        w, d = 11+i%4, 13+i%3
        family = 'concrete' if i%3 else 'ceramic'
        # Faceted, damaged roof line with a dark structural spine.
        prism(name,[(x-w/2,0),(x+w/2,0),(x+w/2,h-12),
            (x+w*.25,h-9),(x+w*.1,h-13),(x-w*.05,h-3),
            (x-w*.24,h),(x-w/2,h-2)],d,z,family,.84)
        for y in range(4,int(h-12),4):
            box(name,(x,y,z+d/2+.02),(w*.85,2.1,.12),'glass',shade=.8)
            for a in (-.3,0,.3):
                box(name,(x+w*a,y,z+d/2+.12),(.18,2.6,.18),family)
        for a in (-.4,.25):
            beam(name,(x+w*a,h-13,z),(x+w*a+.3,h+rng.random()*4,z),.065,'steel')
    # Once a paired municipal relay tower; now an asymmetric torn skyline anchor.
    for x,h in [(-21,88),(20,71)]:
        w,d,z=14,15,-246
        prism(name,[(x-w/2,0),(x+w/2,0),(x+w/2,h-15),
            (x+w*.23,h-21),(x+w*.1,h-8),(x-w*.18,h-11),(x-w/2,h)],d,z,'chalk')
        for y in range(4,h-18,4):
            box(name,(x,y,z+d/2+.1),(w-.7,2.4,.15),'glass')
        for a in (-.46,.05,.45):
            box(name,(x+w*a,(h-18)/2,z+d/2+.3),(.4,h-18,.5),'concrete')
        for i in range(4):
            beam(name,(x-5+i*2,h-14,z),(x-5+i*2.2,h-2-i,z),.09,'oxide')
    box(name,(-7,46,-246),(13,1.4,5),'concrete',tilt=-.15)
    box(name,(9,42,-246),(8,1.4,5),'concrete',tilt=.48)
    # Grounded hillside silhouettes beyond the gameplay bounds.
    for side in (-1,1):
        verts=[]
        cols,rows=15,8
        for j in range(rows):
            z=-320+j*58
            for i in range(cols):
                x=side*(215+i*18)
                y=max(0,math.sin(i/(cols-1)*math.pi)*(.5+.5*math.sin(j*.64+.5))*85)
                y+=rng.uniform(-3,3) if i else 0
                verts.append((x,max(0,y)-1,z))
        faces=[]
        for j in range(rows-1):
            for i in range(cols-1):
                a=j*cols+i
                faces.extend([(a,a+1,a+cols),(a+1,a+cols+1,a+cols)])
        emit(name,verts,faces,'concrete',.6)
