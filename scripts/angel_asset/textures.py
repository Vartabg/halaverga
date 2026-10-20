"""Downscaled, recoloured copies of the pack textures (4096 px PNGs, about 60 MB) for a phone GPU.

The ivory and gold palette replaces the outfits' brown leather and green cloth while keeping their painted folds, stitching and
wear (luminance detail). Every output is a JPEG; nothing in the angel uses alpha.
"""
from pathlib import Path
import numpy as np
import bpy

IVORY = np.array([.95, .91, .82])
GOLD = np.array([.96, .75, .36])
# The packs tint hair and brows from vertex colours; without them the maps are near white.
HAIR = np.array([.36, .22, .12])
BROW = np.array([.20, .12, .07])
# Longest side per material and map, in pixels.
SIZES = {'MI_Superhero_Male': 1024, 'MI_Peasant': 1024, 'MI_Ranger': 1024, 'MI_Regular_Male': 512,
         'MI_Hair_2': 512, 'MI_Hair_1': 256, 'MI_Eyes': 256}
NAMES = {'MI_Superhero_Male': 'Angel skin', 'MI_Regular_Male': 'Angel hands', 'MI_Peasant': 'Ivory tunic',
         'MI_Ranger': 'Gold harness', 'MI_Hair_2': 'Angel hair', 'MI_Hair_1': 'Angel brows', 'MI_Eyes': 'Angel eyes'}


def lum(px):
    return px[..., 0]*.299+px[..., 1]*.587+px[..., 2]*.114


def recolour(material, role, px):
    """px: H x W x 4 floats in the image's stored (sRGB for colour) space."""
    if material == 'MI_Peasant' and role == 'base':
        px[..., :3] = IVORY*np.clip(.55+.62*lum(px), 0, 1)[..., None]
    elif material == 'MI_Ranger' and role == 'base':
        px[..., :3] = np.clip(GOLD*(.30+.95*lum(px))[..., None], 0, 1)
    elif material in ('MI_Hair_2', 'MI_Hair_1') and role == 'base':
        tint = HAIR if material == 'MI_Hair_2' else BROW
        px[..., :3] = np.clip(tint*(.35+1.1*lum(px))[..., None], 0, 1)
    elif material == 'MI_Ranger' and role == 'orm':
        px[..., 1] = .22+.35*px[..., 1]
        px[..., 2] = 1
    return px


def roles(material):
    """Image texture nodes of a glTF-imported material, by the input they feed. The importer routes some base colours
    through a Mix with the vertex colours; the base image is wired straight to the BSDF instead (vertex colours are dropped)."""
    tree = material.node_tree
    found = {}
    bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for link in list(tree.links):
        node = link.from_node
        if node.type != 'TEX_IMAGE':
            continue
        target = link.to_node
        if target.type == 'NORMAL_MAP':
            found['normal'] = node
        elif target.type in ('SEPARATE_COLOR', 'SEPARATE_RGB'):
            found['orm'] = node
        else:
            found['base'] = node
    if 'base' in found:
        tree.links.new(found['base'].outputs['Color'], bsdf.inputs['Base Color'])
    for n in [n for n in tree.nodes if n.type in ('MIX', 'VERTEX_COLOR')]:
        tree.nodes.remove(n)
    return found


def process(materials, folder):
    """Rewrite every texture of the kept materials; rename the materials. Returns {material: [output files]}."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    report = {}
    for m in materials:
        source = m.name.split('.')[0]
        if source not in SIZES:
            raise SystemExit(f'Unexpected material {m.name}')
        for role, node in roles(m).items():
            img = node.image
            w, h = img.size if img else (0, 0)
            if not w:
                print(f'ANGEL_ASSET skipped missing {role} map of {m.name}')
                continue
            size = SIZES[source]
            out = bpy.data.images.new(f'{NAMES[source]} {role}', size, size*h//w, alpha=False)
            img.scale(size, size*h//w)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(size*h//w, size, 4)
            px = recolour(source, role, px)
            px[..., 3] = 1
            out.pixels = px.ravel()
            path = folder/f'{NAMES[source].lower().replace(" ", "-")}-{role}.jpg'
            out.save(filepath=str(path), quality=84)
            out.filepath = str(path)
            out.source = 'FILE'
            out.reload()
            out.colorspace_settings.name = 'sRGB' if role == 'base' else 'Non-Color'
            node.image = out
            report.setdefault(NAMES[source], []).append(path.name)
        m.name = NAMES[source]
    return report
