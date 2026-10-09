"""Fractured modern envelopes; footprints match the existing flight colliders."""
import random
from mesh import box, prism, beam, rubble, sign, BATCHES

# x, base, z, width, depth, floors; mirrors makeCity's collider envelopes.
SITES = [(-34,2,28,17,18,7),(-62,2,16,23,20,10),(36,2,22,18,17,6),
    (68,2,29,21,19,10),(-38,2,-28,20,21,11),(36,2,-38,23,22,16),
    (-70,2,-40,24,24,15),(76,2,-33,23,28,8),(-34,2,-86,18,21,6),
    (37,2,-100,23,20,10),(-73,2,-98,27,22,10),(84,2,-96,28,24,14),
    (-40,2,-146,22,20,10),(43,2,-160,26,20,13),(-109,7,-11,22,27,12),
    (115,8,-5,23,22,13),(-140,15.5,-70,21,23,9),(-173,33.5,-125,19,18,7),
    (140,15.5,-70,21,23,9),(173,33.5,-125,19,18,7)]

def building(site, seed):
    x,base,z,w,d,floors = site
    rng = random.Random(seed+83)
    name = 'district_%02d' % (seed//4)
    h = floors*3.7
    family = ['chalk','concrete','oxide','ceramic'][seed%4]
    # Recessed opaque interior blocks avoid a transparent, unfinished lattice.
    lower = (floors-3)*3.7
    box(name,(x,base+lower/2,z),(w-.55,lower,d-.55),'void')
    box(name,(x-w*.15,base+(lower+h)/2,z), (w*.7-.5,h-lower,d-.65),'void')
    for f in range(floors+1):
        y = base+f*3.7
        broken = f > floors-3
        left, right = x-w/2-.25, x+w/2+.25
        if broken:
            right = x+w*.2
        # Alternating jagged fracture lines: aggregate edges, exposed rebar.
        outline = [(left,y-.22),(right-.7,y-.22),(right-.12,y-.1),
            (right-.5,y+.02),(right,y+.14),(right-.8,y+.25),(left,y+.25)]
        prism(name,outline,d+.6,z, 'concrete', .85+f%3*.04)
        if f == floors:
            continue
        cols = max(3,int(w/3.4))
        spacing = w/cols
        for side in (-1,1):
            zz = z+side*(d/2+.06)
            for c in range(cols):
                xx = x-w/2+(c+.5)*spacing
                if broken and xx > x+w*.18:
                    continue
                wound = abs(c - (cols*.64 + (f%4-2)*.32)) < .8 and f > 1
                missing = wound or (f*11+c*17+seed*7)%13 < (8 if broken else 2)
                # Distinct facade families with chunky spandrels, shadow reveals.
                if not broken or not missing:
                    box(name,(xx,y+.7,zz),(spacing-.13,.96,.5),family,shade=rng.uniform(.68,1.12))
                if c == 0 or c == cols-1 or seed%3 == 0:
                    box(name,(xx-spacing/2+.16,y+1.95,zz),(.29,3.5,.42),'concrete',shade=.84)
                if not missing:
                    box(name,(xx,y+2.32,zz-side*.17),(spacing-.43,2.05,.1),'glass',shade=rng.uniform(.43,1.05))
                    box(name,(xx,y+2.32,zz),(.055,2.05,.12),'steel')
                    box(name,(xx,y+1.3,zz),(spacing-.38,.08,.13),'steel')
                    if (c+f+seed)%5 == 0:
                        # Broken retained pane is a polygon, not a missing square.
                        prism(name,[(xx-spacing*.4,y+1.35),(xx+spacing*.35,y+1.35),
                            (xx+spacing*.12,y+1.85),(xx-spacing*.1,y+2.2),
                            (xx-spacing*.4,y+2.02)],.12,zz+side*.04,'void')
                else:
                    for a in (-1,1):
                        box(name,(xx+a*(spacing/2-.18),y+2.25,zz),(.06,2.2,.12),'steel')
                    # Torn concrete teeth protrude around a dark opening.
                    prism(name,[(xx-spacing*.46,y+1.05),(xx-spacing*.46,y+2.8),
                        (xx-spacing*.3,y+2.24),(xx-spacing*.24,y+1.62),
                        (xx-spacing*.03,y+1.05)],.32,zz,family,.73)
                if (f+c+seed)%7 == 0:
                    # Rusted mullion, crumbled sill, runoff stains.
                    box(name,(xx+.4,y+1.2,zz+side*.29),(.14,1.6,.025),'oxide',shade=.6)
        # Side facades face the canal and need more than a giant glass rectangle.
        for side in (-1,1):
            xx = x+side*(w/2+.1)
            if broken and side == 1:
                xx = x+w*.2
            for c in range(max(3,int(d/3.4))):
                zz = z-d/2+1.8+c*3.4
                box(name,(xx,y+.7,zz),(.5,1.0,3.28),family,shade=rng.uniform(.65,1.1))
                box(name,(xx-side*.1,y+2.32,zz),(.12,2.05,2.85),'glass',shade=rng.uniform(.38,.8))
                box(name,(xx,y+2.25,zz-1.55),(.38,3.4,.22),'concrete',shade=.8)
            # Open floor edges at the fracture show bent reinforcing strands.
            if broken:
                for c in range(4):
                    zz = z-d/2+1+c*3
                    beam(name,(x+w*.19,y+.12,zz),(x+w*.24,y+.5+rng.random(),zz+.4),.034)
    # Large torn wall planes interrupt the office-grid rhythm and reveal the collapse.
    for side in (-1,1):
        zz = z+side*(d/2+.39)
        left = x-w*.5
        if seed%3 != 1:
            prism(name,[(left,base+1),(left+w*.31,base+1),
                (left+w*.31,base+h*.42),(left+w*.22,base+h*.47),
                (left+w*.27,base+h*.59),(left+w*.12,base+h*.7),
                (left+w*.16,base+h*.82),(left,base+h*.92)],.42,zz,family,.92)
        # A fractured concrete crown, with reinforcing rods cut at uneven lengths.
        prism(name,[(left,base+h-6),(left+w*.64,base+h-6),
            (left+w*.59,base+h-4.4),(left+w*.42,base+h-3.1),
            (left+w*.36,base+h-3.8),(left+w*.24,base+h-.4),
            (left+w*.13,base+h-1.1),(left,base+h)],.45,zz,'concrete',.88)
        for i in range(5):
            xx = left+w*(.22+i*.1)
            beam(name,(xx,base+h-4.5,zz),(xx+.3,base+h-2.3-i*.45,zz),.035)
        for f in range(2,floors-2,3):
            yy = base+f*3.7
            beam(name,(x+w*.15,yy,zz),(x+w*.37,yy+3.4,zz),.11,'oxide')
    # Structural fins give towers recognizably different silhouettes.
    if seed%3 != 0:
        for side in (-1,1):
            for a in (-.38,.1):
                xx = x+w*a
                box(name,(xx,base+h*.42,z+side*(d/2+.35)),(.65,h*.84,.7),family,shade=.78)
    # Rooftop service cluster, cooling fins, tank, vents, dish mast.
    for c in range(2):
        xx, zz = x-w*.28+c*3.7, z-d*.2
        box(name,(xx,base+h+.65,zz),(2.8,1.25,2.3),'steel')
        for j in range(7):
            box(name,(xx-1.2+j*.38,base+h+1.29,zz),(.12,.09,2.0),'concrete',shade=.55)
    beam(name,(x-w*.37,base+h,z+d*.26),(x-w*.37,base+h+4,z+d*.26),.085,'steel')
    for f in range(3):
        for c in range(3):
            rubble(name,x+w*.05+c*.7,base+h-f*3.7+.3,z+d*.32, .2+rng.random()*.5)
    # Painted identities convey a former everyday city, rather than sci-fi props.
    if seed in (0,2,5):
        labels = {0:'MERIDIAN',2:'CIVIC ARCHIVE',5:'NORTH / 08'}
        zz = z+d/2+.65
        box(name,(x-w*.12,base+lower-1.2,zz),(w*.83,2.15,.18),'ceramic')
        sign(name,labels[seed],(x-w*.48,base+lower-1.65,zz+.11),w/(len(labels[seed])*1.0))
