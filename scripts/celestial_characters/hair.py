"""Swept, layered hair locks and an open diadem: leave the anatomical face visible."""
from math import pi, sin, cos
from mesh import tube, sphere
from outfit_shapes import cut


def make(source, hair, gold, light, iris):
    cap=cut(source,'Fitted hair cap',lambda p: p.z>1.785 or (p.y>.008 and p.z>1.69),.004,(1,1,1,1),smooth=4)
    cap.data.materials.append(hair)
    parts = [cap]
    # Separate overlapping locks with taper and directional grooves, not a bald helmet.
    for layer in range(2):
        for j in range(40):
            a = -pi*.94+j/39*pi*1.88
            points, radii = [], []
            for k in range(10):
                t = k/9
                theta = .19+t*(1.72+.28*sin(a)**2)
                x = (.094+layer*.003)*sin(theta)*sin(a)
                y = -.012+(.092+layer*.003)*sin(theta)*cos(a)
                z = 1.735+.135*cos(theta)-t*t*.014*layer
                points.append((x, y, z))
                radii.append((.0045+.001*layer)*(sin(pi*t)**.3+.15))
            parts.append(tube('Swept hair lock', points, radii, hair, 6))
    # A short, wavy fall behind the neck reads from the actual chase camera.
    for j in range(15):
        u = (j-7)/7
        points = [(u*(.075+.014*t), .071+.012*sin(t*8+j*.3), 1.73-t*(.19+.025*cos(j))) for t in [i/10 for i in range(11)]]
        parts.append(tube('Nape lock', points, [.010*(1-i/11)**.55 for i in range(11)], hair, 6))
    for j in range(25):
        x=(j-12)*.006
        points=[(x+.030*t,-.047-.075*sin(t*pi*.63),1.858-(.055+.008*sin(j*.9))*t+.009*sin(t*pi)) for t in [i/12 for i in range(13)]]
        parts.append(tube('Swept fringe',points,[.0045*(1-i/14)**.4 for i in range(13)],hair,6))
    # Brow circlet, a small central agate, and articulated laurel leaves.
    for s in (-1, 1):
        points = [(s*.099*sin(t*1.8), -.006-.108*cos(t*1.8), 1.77+.016*sin(t*pi)) for t in [i/20 for i in range(21)]]
        parts.append(tube('Open diadem', points, [.004]*21, gold, 8))
        for j in range(8):
            a = .22+j*.19
            centre = (s*.101*sin(a), -.006-.110*cos(a), 1.78+.014*sin(a*pi/1.8))
            leaf = sphere('Laurel leaf', centre, (.009, .003, .019), light, 8, 6)
            # All transforms are baked by sphere; the leaf tilt is subtle in the silhouette.
            parts.append(leaf)
    parts.append(sphere('Brow agate', (0, -.118, 1.777), (.009, .004, .013), iris, 12, 8))
    return parts
