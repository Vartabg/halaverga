"""Anatomical shape edits of the retained Studio base, not primitive assembly.

Coordinates are the source's X/right, Y/height, Z/front. The original Basis
stays editable. Regional changes retain the source's muscle and joint forms.
"""
from math import exp
from mathutils import Vector
from common import smooth

HEIGHT = [(-.00555, 0), (.08, .097), (.465, .517), (.86, .959),
          (1.12, 1.234), (1.39, 1.528), (1.46, 1.613), (1.68436, 1.85)]


def height(value):
    # Continuous monotone Hermite mapping; no slope breaks at a body landmark.
    slopes = [(b[1]-a[1])/(b[0]-a[0]) for a, b in zip(HEIGHT, HEIGHT[1:])]
    tangents = [slopes[0]] + [(a+b)/2 for a, b in zip(slopes, slopes[1:])] + [slopes[-1]]
    for i, ((a, u), (b, v)) in enumerate(zip(HEIGHT, HEIGHT[1:])):
        if value <= b:
            t = max(0, (value-a)/(b-a))
            return ((2*t**3-3*t*t+1)*u+(t**3-2*t*t+t)*(b-a)*tangents[i]
                    +(-2*t**3+3*t*t)*v+(t**3-t*t)*(b-a)*tangents[i+1])
    return HEIGHT[-1][1]


def gaussian(value, centre, width):
    return exp(-((value-centre)/width)**2)


def athletic(point):
    x, y, depth = point
    side = 1 if x > 0 else -1
    ax = abs(x)
    head = smooth(1.395, 1.465, y)
    scale = 1.09*(1-head)+1.055*head
    px, pd = x*scale, depth*scale
    # Torso shaping stops before the arms; lower-body masks cannot catch wrists.
    torso = (1-smooth(.17, .235, ax))*smooth(.84, .95, y)*(1-smooth(1.35, 1.43, y))
    waist = gaussian(y, 1.06, .115)*torso
    px *= 1-.052*waist
    pd *= 1-.035*waist
    # Pectorals retain their attachment and central separation, with modest depth.
    chest = gaussian(y, 1.285, .083)*gaussian(ax, .092, .073)
    pd += .014*chest*smooth(.025, .10, depth)
    # Lats and deltoids widen the shoulder line without inflating the neck.
    lats = gaussian(y, 1.225, .11)*gaussian(ax, .164, .052)
    px += side*.012*lats
    shoulder = gaussian(y, 1.338, .08)*gaussian(ax, .234, .065)
    px += side*.018*shoulder
    pd += .004*shoulder*(2*smooth(-.035, .035, depth)-1)
    # Carry the broader shoulder into the whole arm, tapering toward the wrist.
    arm = smooth(.195, .27, ax)*smooth(.76, .91, y)*(1-smooth(1.35, 1.43, y))
    px += side*.012*arm
    # Preserve calf/knee/Achilles distinctions; improve the athletic thigh volume.
    thigh = gaussian(y, .685, .13)*smooth(.025, .065, ax)*(1-smooth(.2, .26, ax))
    px += side*.006*thigh
    pd += .006*thigh*smooth(0, .05, depth)
    return Vector((px, height(y), pd))


def garment(point, fitted):
    """A smooth cloth envelope replaces exposed crotch and nipple detail."""
    x, y, depth = point
    result = fitted.copy()
    pelvis = gaussian(y, .835, .072)*(1-smooth(.055, .092, abs(x)))
    # A convex fabric front, with smooth blending into the existing hip surface.
    if depth > .015:
        target = .105-.19*(x*x)
        result.z = result.z*(1-pelvis)+target*pelvis
    return result
