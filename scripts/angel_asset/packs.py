"""The four Quaternius CC0 packs the angel is assembled from (provenance: docs/art/angel-asset/PROVENANCE.md).

The packs are not committed (about 500 MB). Download the free [Standard] zips, extract each into one folder, and pass that
folder as --packs. Every path below is relative to it.
"""
from pathlib import Path
import bpy

BASE = 'Universal Base Characters[Standard]'
OUTFITS = 'Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits'
FILES = {
    'hero': f'{BASE}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf',
    'hair': f'{BASE}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Long.gltf',
    'peasant': f'{OUTFITS}/Male_Peasant.gltf',
    'ranger': f'{OUTFITS}/Male_Ranger.gltf',
    'ual1': 'Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    'ual2': 'Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
}
# Pieces kept from each outfit; the rest of each outfit (hood, belts, the peasant's own boots and arms) is dropped.
KEEP = {
    'hero': ['SuperHero_Male', 'Eyebrows', 'Eyes'],
    'hair': ['Hair_Long'],
    'peasant': ['Male_Peasant_Body', 'Male_Peasant_Legs', 'Male_Peasant_Arms'],
    'ranger': ['Male_Ranger_Arms_Bracer', 'Male_Ranger_Acc_Pauldron', 'Male_Ranger_Feet_Boots'],
}


def load(packs, key):
    """Import one pack file; return (armature, kept meshes, {clip name: action}). Bone display spheres and unkept pieces are deleted."""
    path = Path(packs)/FILES[key]
    if not path.exists():
        raise SystemExit(f'Missing pack file: {path}')
    before, acts = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == 'ARMATURE')
    keep = KEEP.get(key)
    meshes = []
    for o in new:
        if o.type != 'MESH':
            continue
        if keep is None or o.name.split('.')[0] not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            meshes.append(o)
    if keep is not None and len(meshes) != len(keep):
        raise SystemExit(f'{key}: expected {keep}, found {[m.name for m in meshes]}')
    # The importer names each action '<clip>_<armature object>'.
    clips = {a.name[:-len(rig.name)-1]: a for a in bpy.data.actions if a not in acts and a.name.endswith('_'+rig.name)}
    rig.name = f'source {key}'
    return rig, meshes, clips
