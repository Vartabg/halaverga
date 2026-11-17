"""Plain glTF-ready materials, at most six per body (docs/plans/2026-11-16-real-fight.md B8): skin, hair, one alpha-masked 'face'
atlas for the eyes, brows and lashes (so the lashes cost no draw), the chiton palette (cloth, trim, leather and sandal swatches)
and, on the Watcher, flat bronze. The hair keeps its own material because its cards tile their map (UVs run from -2 to 3).
Colour maps come from each asset's .mhmat, graded to the owner's palette and downscaled for a phone GPU (1024 px at most). Opaque
maps become JPEG; the hair and the face atlas keep a PNG alpha that the exporter writes as an alpha mask.
"""
from pathlib import Path
import numpy as np
import bpy
from bodies import mhmat_fields

# role: (longest side in px, alpha mask, roughness)
ROLES = {'body': (1024, False, .6), 'eyes': (256, False, .15), 'eyebrows': (256, True, .9), 'eyelashes': (256, True, .9),
         'hair': (512, True, .8)}
# sRGB swatches of the chiton palette per body: cloth, trim (belt and hems), leather (pteruges), sandal (soles and straps).
PALETTE = {'archangel': {'cloth': (.94, .90, .80), 'trim': (.80, .60, .22), 'leather': (.20, .12, .07), 'sandal': (.42, .27, .15)},
           'watcher': {'cloth': (.30, .06, .06), 'trim': (.12, .05, .04), 'leather': (.20, .12, .07), 'sandal': (.15, .09, .05)}}
SWATCH = {name: ((k + .5) / 4, .5) for k, name in enumerate(('cloth', 'trim', 'leather', 'sandal'))}  # UV centre of each quarter
HAIR = {'archangel': (.30, .19, .11), 'watcher': (.08, .06, .05)}
# Face atlas tiles (u0, v0, width, height in UV): eyes bottom left, brows top right, lashes bottom right.
TILES = {'eyes': (0, 0, .5, .5), 'eyebrows': (.5, .5, .5, .5), 'eyelashes': (.5, 0, .5, .5)}
LUM = np.array([.299, .587, .114], dtype=np.float32)


def grade(body, role, px, skin_rgb=None):
    """px: H x W x 4 sRGB floats. Skin: per-channel gain so the median skin colour lands on skin_rgb (keeps pores, lips, shading).
    Hair: tint by luminance."""
    rgb, lum = px[..., :3], px[..., :3] @ LUM
    if role == 'body' and skin_rgb:
        mid = (lum > .1) & (lum < .97)
        px[..., :3] = np.clip(rgb * (np.array(skin_rgb) / np.median(rgb[mid], axis=0)), 0, 1)
    elif role == 'hair':
        seen = px[..., 3] > .5
        ratio = np.clip(lum / max(np.median(lum[seen]), 1e-3), 0, 2.4)[..., None]
        px[..., :3] = np.clip(np.array(HAIR[body]) * ratio, 0, 1)
    return px


def _save(img, out, alpha):
    img.file_format = 'PNG' if alpha else 'JPEG'
    img.save(filepath=str(out), quality=85)
    img.filepath = str(out)
    img.source = 'FILE'
    img.reload()
    img.name = out.name


def _scaled(source, size, out, alpha, body, role, skin_rgb):
    img = bpy.data.images.load(str(source), check_existing=False)
    w, h = img.size
    if max(w, h) > size:
        img.scale(size, max(1, size * h // w)) if w >= h else img.scale(max(1, size * w // h), size)
    sw, sh = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(sh, sw, 4)
    img.pixels = grade(body, role, px, skin_rgb).ravel()
    _save(img, out, alpha)
    return img, [w, h]


def _principled(name, img, roughness, alpha, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    if alpha:
        # 1 - (alpha < cutoff): the glTF exporter writes this as alphaMode MASK with that cutoff.
        less = nt.nodes.new('ShaderNodeMath')
        less.operation = 'LESS_THAN'
        less.inputs[1].default_value = .35
        nt.links.new(tex.outputs['Alpha'], less.inputs[0])
        one = nt.nodes.new('ShaderNodeMath')
        one.operation = 'SUBTRACT'
        one.inputs[0].default_value = 1.0
        nt.links.new(less.outputs[0], one.inputs[1])
        nt.links.new(one.outputs[0], bsdf.inputs['Alpha'])
    m.use_backface_culling = not (alpha or double)
    return m


def material(body, role, mhmat, folder, skin_rgb=None):
    """A Principled material '<body> <role>' using the graded diffuse map of `mhmat`. Returns (material, report row)."""
    size, alpha, roughness = ROLES[role]
    name = f'{body} {role}'
    source = Path(mhmat).parent / mhmat_fields(mhmat)['diffuseTexture']
    out = Path(folder) / f"{name.replace(' ', '-')}.{'png' if alpha else 'jpg'}"
    img, source_size = _scaled(source, size, out, alpha, body, role, skin_rgb)
    w, h = img.size
    return _principled(name, img, roughness, alpha), {'material': name, 'file': out.name, 'size': [w, h],
                                                      'bytes': out.stat().st_size, 'source': source.name, 'source_size': source_size}


def _image(obj):
    return next(n.image for n in obj.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')


def atlas(body, parts, folder, size=512):
    """One alpha-masked material '<body> face' for the eyes, brows and lashes (each already given its graded map by material()):
    their maps are packed into a size x size atlas (TILES; the eyes keep full alpha) and each piece's UVs moved into its tile.
    Returns the report row with each piece's UV range; UVs outside 0..1 would be clamped and are counted (these packs have none)."""
    px = np.zeros((size, size, 4), dtype=np.float32)
    clamped, ranges, old = 0, {}, {parts[r].data.materials[0] for r in TILES}
    for role, (u0, v0, w, h) in TILES.items():
        obj = parts[role]
        uvs = [tuple(loop.uv) for loop in obj.data.uv_layers.active.data]
        ranges[role] = [round(min(u for u, _ in uvs), 3), round(max(u for u, _ in uvs), 3),
                        round(min(v for _, v in uvs), 3), round(max(v for _, v in uvs), 3)]
        img = _image(obj).copy()
        tw, th = round(w * size), round(h * size)
        if tuple(img.size) != (tw, th):
            img.scale(tw, th)
        x, y = round(u0 * size), round(v0 * size)
        px[y:y + th, x:x + tw] = np.array(img.pixels[:], dtype=np.float32).reshape(th, tw, 4)
        bpy.data.images.remove(img)
        for loop in obj.data.uv_layers.active.data:
            u, v = loop.uv
            clamped += not (-.001 <= u <= 1.001 and -.001 <= v <= 1.001)
            loop.uv = (u0 + min(1, max(0, u)) * w, v0 + min(1, max(0, v)) * h)
    out = Path(folder) / f'{body}-face.png'
    img = bpy.data.images.new(out.name, size, size, alpha=True)
    img.pixels = px.ravel()
    _save(img, out, True)
    mat = _principled(f'{body} face atlas', img, .5, True)
    for role in TILES:
        assign(parts[role], mat)
    for m in old:
        bpy.data.materials.remove(m)
    mat.name = f'{body} face'
    return {'material': mat.name, 'file': out.name, 'size': [size, size], 'bytes': out.stat().st_size,
            'source': 'atlas of eyes, eyebrows, eyelashes', 'source_size': None, 'uv_clamped': clamped,
            'uv_ranges': ranges}


def palette(body, folder, roughness=.85):
    """'<body> chiton': a 64 x 16 texture of four swatches (PALETTE), faces pick one by their UVs (SWATCH). One material, one tiny
    PNG, sharp colour edges at any mip level the game will use. Double-sided (open panels and straps)."""
    px = np.ones((16, 64, 4), dtype=np.float32)
    for k, rgb in enumerate(PALETTE[body].values()):
        px[:, 16 * k:16 * (k + 1), :3] = rgb
    out = Path(folder) / f'{body}-chiton.png'
    img = bpy.data.images.new(out.name, 64, 16)
    img.colorspace_settings.name = 'sRGB'
    img.pixels = px.ravel()
    img.file_format = 'PNG'
    img.filepath_raw = str(out)
    img.save()
    m = _principled(f'{body} chiton', img, roughness, False, double=True)
    return m, {'material': m.name, 'file': out.name, 'size': [64, 16], 'bytes': out.stat().st_size, 'source': 'generated',
               'source_size': None}


def swatch(obj, name):
    """Every UV of obj on one palette swatch (one UV layer, 'UVMap')."""
    me = obj.data
    for layer in [layer.name for layer in me.uv_layers][1:]:
        me.uv_layers.remove(me.uv_layers[layer])
    layer = me.uv_layers[0] if me.uv_layers else me.uv_layers.new()
    layer.name = 'UVMap'
    for loop in layer.data:
        loop.uv = SWATCH[name]


def flat(name, rgb, metallic, roughness):
    """Untextured material (armour): base colour, metallic, roughness; double-sided so open shell edges never vanish."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    m.use_backface_culling = False
    return m


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0
