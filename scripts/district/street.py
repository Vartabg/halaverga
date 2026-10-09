"""Rupture debris, infrastructure, and restrained narrative dressing."""
import random
from mesh import box, prism, beam, rubble, sign

def dress_streets():
    rng = random.Random(80)
    for side in (-1,1):
        name = 'quay_%s' % side
        for z in range(-150,65,12):
            # Stained retaining panels, tide marks, rusty tiebacks.
            box(name,(side*14.53,1.5,z),(.07,2.5,10.8),'concrete',shade=.46)
            box(name,(side*14.46,.55,z),(.03,.6,10.9),'oxide',shade=.47)
            for j in (-3,3):
                box(name,(side*14.45,2.7,z+j),(.1,.32,.35),'steel')
            for i in range(4):
                rubble(name,side*(18+rng.random()*6),2.1,z+rng.random()*6, rng.uniform(.18,.8))
        for z in (48,11,-57,-117):
            x = side*20
            beam(name,(x,2.2,z),(x+.6,9,z),.085,'steel')
            beam(name,(x+.6,9,z),(x-side*1.9,9.3,z),.07,'steel')
            box(name,(x-side*1.7,9.2,z),(.8,.2,.38),'steel')
        # Impact apron and reinforcement around the severed viaduct.
        for i in range(18):
            x = side*(10+rng.random()*5)
            z = -4+rng.random()*6
            rubble(name,x,15.63,z,.15+rng.random()*.48)
        for i in range(7):
            x, z = side*(9.3+rng.random()), -4+i
            beam(name,(x,15.2,z),(x-side*1.8,14.6,z+.3),.033)
        for x in range(15,50,5):
            box(name,(side*x,13.35,-4.65),(4.8,1.4,.12),'oxide',shade=.62)
            for j in (-1.8,1.8):
                box(name,(side*x+j,13.35,-4.74),(.13,.16,.08),'steel')
    # Arrival terrace: perimeter grit and expansion seams, clear launch space.
    name = 'arrival'
    for x in (-10.5,10.5):
        for i in range(20):
            rubble(name,x+rng.uniform(-.45,.45),20.12,57+i*.85,rng.uniform(.08,.26))
    for x in (-6,0,6):
        box(name,(x,20.078,65),(.027,.012,17),'void')
    for z in (59,65,71):
        box(name,(0,20.078,z),(21,.012,.027),'void')
    # Painted hazard chevrons wrap an existing platform block, no new obstruction.
    box(name,(-7,21,58.66),(1.65,2,.015),'ceramic')
    sign(name,'08',(-7.65,20.4,58.68),.7)
