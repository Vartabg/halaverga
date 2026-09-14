"""Reference-constrained shape-key edits of the intact Studio anatomy mesh."""
from math import exp
from mathutils import Vector
from common import lerp_table, smooth

# Source landmarks are inspected on the Studio base; targets are reference pixels.
HEIGHTS = [(-.00555,.018),(.08,.177),(.465,.597),(.86,1.097),
           (1.12,1.31),(1.39,1.625),(1.46,1.742),(1.58,1.864),(1.68436,1.97)]
WIDTHS = [(-.01,1.13),(.4,1.15),(.82,1.08),(1.04,1.11),(1.3,1.14),(1.4,1.2),(1.5,1.2)]


def fit_point(point,revision=0):
    x,height,depth = point
    head = smooth(1.40,1.48,height)
    arm = smooth(.19,.27,abs(x))*(1-smooth(1.35,1.45,height))
    if revision >= 1: arm *= smooth(.70,.78,height)
    z = lerp_table(HEIGHTS,height)
    width = lerp_table(WIDTHS,height)
    # Independent arm mapping preserves hand length; global torso mapping does not.
    arm_z = lerp_table([(.68,.856),(.83,1.071),(1.075,1.31),(1.385,1.625)],height)
    z = z*(1-arm)+arm_z*arm
    px = x*width
    px = px*(1-arm)+x*1.045*arm
    if revision >= 1:
        # The first render revealed that the arm field was also catching ankles.
        # Spread the intact legs to the observed ankle/knee spacing, taper at hip.
        leg = 1-smooth(.50,.88,height)
        px += (1 if x>0 else -1)*.027*leg*smooth(.025,.09,abs(x))
        if revision >= 2:
            px *= 1-.045*arm
            z -= .045*arm*(1-smooth(.90,1.15,height))
    pd = depth*(1.16*(1-head)+1.12*head)-.024*head
    # A fitted fabric envelope over the pelvis, not exposed anatomical detail.
    pelvis = exp(-(x/.075)**4-((height-.79)/.10)**4)
    if pd > .065: pd = pd*(1-pelvis)+.065*pelvis
    if head:
        # Bring jaw width and chin plane toward the angular original close-up.
        jaw = exp(-((height-1.49)/.035)**2)
        px *= 1+.035*jaw
        pd += .004*jaw*smooth(.025,.08,depth)
        if revision >= 1:
            px *= 1+.065*exp(-((height-1.478)/.026)**2)
            pd += .005*exp(-((height-1.568)/.016)**2)*exp(-((abs(x)-.034)/.025)**2)*smooth(.07,.11,depth)
            pd += .006*exp(-((height-1.52)/.025)**2)*exp(-(x/.014)**2)*smooth(.10,.13,depth)
    return Vector((px,z,pd))


def reshape(body,eyes,revision):
    if body.data.shape_keys:
        for key in body.data.shape_keys.key_blocks: key.value = 0
    basis = body.data.shape_keys.key_blocks['Basis']
    fit = body.shape_key_add(name='Reference silhouette - editable fit')
    for source,target in zip(basis.data,fit.data): target.co = fit_point(source.co,revision)
    fit.value = 1
    body['source_vertices'] = len(body.data.vertices)
    body['source_faces'] = len(body.data.polygons)
    body['proof_geometry'] = True
    # Eye coordinates are already world-space relative to the source body origin.
    for eye,position in eyes:
        local = Vector((position.x,position.z,-position.y))
        mapped = fit_point(local,revision)
        eye.parent = None
        eye.location = (mapped.x,-mapped.z,mapped.y)
        eye.scale *= 1.17
        eye['proof_geometry'] = True
