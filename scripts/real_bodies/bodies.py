"""MakeHuman bodies generated headless through the MPFB 2 extension (Blender 4.2+), dressed from MakeHuman asset packs.

Every asset path is relative to one folder of extracted MakeHuman packs (--assets); each pack's `x/` folder holds eyebrows/,
eyelashes/, eyes/, proxymeshes/, skins/, clothes/ and hair/. Source frame (MPFB): Blender metres, Z up, feet on the ground, the
character faces -Y and its left side is +X, the same frame rest.py assumes for the Quaternius rigs.
"""
from importlib import import_module
from pathlib import Path
import json
import re
import bpy

MPFB = 'bl_ext.user_default.mpfb'
SYSTEM = 'makehuman_system_assets/x'
# Phenotype macros (0..1, MakeHuman's own sliders). Height is found by bisection on the 'height' macro. chest: game chest-bone
# head above the pelvis (the wing root; today's angel 0.40 m, the Watcher scaled by height). skin: median sRGB the skin map is
# graded to (olive, Near Eastern). Hair is fitted by MPFB (materials.py atlases the eyes, brows and lashes). The chiton, sandals
# and armour are shaped from the body (garments.py, sandals.py, armour.py): the dress01 tunic was dropped (its file says AGPL3 while
# its pack says CC0) and the CC-BY shoes02 sandals are not shipped, so every shipped asset is CC0 or made here.
BODIES = {
    'archangel': {'height': 1.88, 'macro': {'gender': 1.0, 'age': .5, 'muscle': .85, 'weight': .55, 'proportions': 1.0},
                  'skin': f'{SYSTEM}/skins/young_caucasian_male/young_caucasian_male.mhmat', 'skin_rgb': (.76, .57, .40),
                  'chest': .40, 'hair': 'hair01/x/hair/faydaen_hair_1/faydaen_hair_1.mhclo',
                  'clothes': {}},
    'watcher': {'height': 2.00, 'macro': {'gender': 1.0, 'age': .62, 'muscle': 1.0, 'weight': .85, 'proportions': .85},
                'skin': f'{SYSTEM}/skins/middleage_caucasian_male/middleage_caucasian_male.mhmat', 'skin_rgb': (.64, .46, .32),
                'chest': .426, 'hair': 'hair01/x/hair/cortu_short_messy_hair/cortu_short_messy_hair.mhclo',
                'clothes': {}},
}
COMMON = {
    'proxy': f'{SYSTEM}/proxymeshes/male_muscle_13290/male_muscle_13290.proxy',
    'eyes': f'{SYSTEM}/eyes/low-poly/low-poly.mhclo',
    'eye_material': f'{SYSTEM}/eyes/materials/brown.mhmat',
    'eyebrows': f'{SYSTEM}/eyebrows/eyebrow001/eyebrow001.mhclo',
    'eyelashes': f'{SYSTEM}/eyelashes/eyelashes01/eyelashes01.mhclo',
}
RACE = {'asian': .33, 'caucasian': .34, 'african': .33}


def services():
    return import_module(MPFB + '.services.humanservice').HumanService


def body_height(basemesh):
    """Standing height of the shaped body (helpers masked away), in metres."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = basemesh.evaluated_get(dg)
    mesh = ev.to_mesh()
    zs = [(basemesh.matrix_world @ v.co).z for v in mesh.vertices]
    ev.to_mesh_clear()
    return max(zs) - min(zs)


def _create(macro):
    full = {'cupsize': .5, 'firmness': .5, 'height': .5, **macro, 'race': dict(RACE)}
    return services().create_human(macro_detail_dict=full, scale=0.1, feet_on_ground=True)


def _remove(obj):
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def fit_height(spec, steps=9):
    """Bisect the height macro until the body stands at spec['height']; returns (basemesh, macro, measured height)."""
    lo, hi, best = 0.0, 1.0, None
    for _ in range(steps):
        mid = (lo + hi) / 2
        macro = {**spec['macro'], 'height': mid}
        bm = _create(macro)
        h = body_height(bm)
        if best:
            _remove(best[0])
        best = (bm, macro, h)
        lo, hi = (mid, hi) if h < spec['height'] else (lo, mid)
    return best


def mhmat_fields(path):
    """name -> value for the keys of a MakeHuman material file (comments skipped)."""
    out = {}
    for line in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if not line or line.startswith(('#', '//')):
            continue
        key, _, value = line.partition(' ')
        out.setdefault(key, value.strip())
    return out


def licence(path):
    """What the file itself states: a 'license' line or '# license' comment, an author line, or the system CC0 notice."""
    text = Path(path).read_text(encoding='utf-8', errors='replace')[:6000]
    lic = re.search(r'^#?\s*licen[sc]e:?\s+(.+)$', text, re.I | re.M)
    author = re.search(r'^#?\s*author:?\s+(.+)$', text, re.I | re.M)
    stated = lic.group(1).strip() if lic else ('CC0 (header notice)' if 'released as CC0' in text else None)
    if not stated and re.search(r'\bCC0\b', text):
        stated = 'CC0 (comment)'
    return {'file_says': stated, 'file_author': author.group(1).strip() if author else None}


def pack_notes(root):
    """Asset name -> pack note (licence, author, source) from every pack's packs/*.json under root."""
    notes = {}
    for pj in Path(root).glob('*/x/packs/*.json'):
        for key, row in json.loads(pj.read_text()).items():
            notes[key] = {'pack': pj.stem, 'licence': row.get('license'), 'author': row.get('author'), 'source': row.get('source')}
    return notes


def build(name, assets, hair=None):
    """One MPFB human with the game_engine rig, body proxy, eyes, brows, lashes, clothes and hair.
    Returns (rig, basemesh, {role: object}, record); record lists macros, height, and every source file with its licences."""
    spec = dict(BODIES[name])
    if hair:
        spec['hair'] = hair
    root = Path(assets)
    hs = services()
    # MPFB re-finds the body proxy by name when it carries a garment's delete group onto it: point its asset root at the pack.
    settings = import_module(MPFB + '.ui.apply_assets.assetlibrary.assetsettingspanel').ASSET_SETTINGS_PROPERTIES
    settings.set_value('second_root', str(root / SYSTEM), entity_reference=bpy.context.scene)
    basemesh, macro, height = fit_height(spec)
    basemesh.name = f'{name}.body'
    rig = hs.add_builtin_rig(basemesh, 'game_engine')
    files = {'skin': spec['skin'], **COMMON, 'hair': spec['hair'], **spec['clothes']}
    kinds = {'proxy': 'Proxymeshes', 'eyes': 'eyes', 'eyebrows': 'eyebrows', 'eyelashes': 'eyelashes', 'hair': 'hair'}
    parts = {}
    for role in ('proxy', 'eyes', 'eyebrows', 'eyelashes', *spec['clothes'], 'hair'):
        kind = kinds.get(role, 'Clothes')
        parts['body' if role == 'proxy' else role] = hs.add_mhclo_asset(
            str(root / files[role]), basemesh, asset_type=kind, subdiv_levels=0, material_type='NONE')
    notes = pack_notes(root)
    record = {'macro': macro, 'race': RACE, 'height_m': round(height, 4), 'files': {}}
    for role, rel in files.items():
        key = Path(rel).stem if role == 'eye_material' else Path(rel).parent.name
        row = {'path': rel, **licence(root / rel)}
        if rel.endswith('.mhclo'):
            mats = list((root / rel).parent.glob('*.mhmat'))
            if mats:
                row['mhmat'] = str(mats[0].relative_to(root))
                row['mhmat_says'] = licence(mats[0])['file_says']
        if key in notes:
            row['pack_note'] = notes[key]
        record['files'][role] = row
    return rig, basemesh, parts, record
