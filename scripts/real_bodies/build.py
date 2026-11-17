"""Build the game's realistic bodies (docs/plans/2026-11-16-real-fight.md B5, B8, B9): dressed MakeHuman (MPFB 2) humans on the
game's 21-bone rig, with Universal Animation Library clips under the game's clip names, as <out>/archangel.glb and
<out>/watcher.glb (copy them to public/models/), report.json and asset.json (copy to art/real-bodies/asset.json).

Run with Blender 4.2+ that has the MPFB extension enabled (run.sh in this folder installs it into a sandboxed user dir):
  Blender -b --python-exit-code 1 --python build.py -- --assets <halaverga-real> --packs <folder with the two UAL folders> --out <dir>
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / 'angel_asset')]
from packs import load  # noqa: E402
from rest import finger_pose  # noqa: E402
from assemble import NAMES  # noqa: E402
from retarget import sample  # noqa: E402
import glbclips  # noqa: E402
import armour  # noqa: E402
import assetjson  # noqa: E402
import bodies  # noqa: E402
import clips as cliplist  # noqa: E402
import garments  # noqa: E402
import inplace  # noqa: E402
import materials  # noqa: E402
import rig21  # noqa: E402
import sandals  # noqa: E402

BUDGETS = {'body': 14000}  # triangles per piece; the chiton, sandals and bronze are decimated where they are made

parser = argparse.ArgumentParser()
parser.add_argument('--assets', required=True)
parser.add_argument('--packs', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--bodies', default='archangel,watcher')
parser.add_argument('--flatten-vertical', action='store_true',
                    help='also remove vertical drift and cap the bob (default: horizontal travel only, height as the source)')
parser.add_argument('--hair', action='append', default=[], help='body=<hair .mhclo relative to --assets>, to try another hair')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
out_dir = Path(args.out)
out_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
libraries = {key: load(args.packs, key) for key in ('ual1', 'ual2')}
ual_rig, _, ual_clips = libraries['ual1']
grip = finger_pose(ual_rig, ual_clips['Sword_Idle'], ual_clips['Sword_Idle'].frame_range[0])
relaxed = finger_pose(ual_rig, ual_clips['Idle_Loop'], ual_clips['Idle_Loop'].frame_range[0])
fingers = {k: v for k, v in relaxed.items() if k.endswith('_l')} | {k: v for k, v in grip.items() if k.endswith('_r')}
ref = rig21.reference(ual_rig, fingers)
ual_leg = rig21.leg(ual_rig)


def export(meshes, skeleton, path):
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    skeleton.select_set(True)
    bpy.context.view_layer.objects.active = skeleton
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_animations=False,
                              export_skins=True, export_yup=True, export_apply=False, export_materials='EXPORT',
                              export_texcoords=True, export_normals=True, export_tangents=False, export_image_format='AUTO')


def dresser(name, tex_dir, textures):
    """The dress step for rig21.to_game: the chiton and the sandals for both; the Watcher's armour over the chiton, his pteruges
    pushed outside the skirt and the hair cards over his eyes trimmed; then the skin under the chiton's inner layer is deleted."""
    def dress(rig, pieces):
        report, ctx = garments.dress(name, rig, pieces, tex_dir, belt=name != 'watcher')
        textures.append(ctx['texture'])
        chiton = pieces['chiton'].data.materials[0]
        report['sandals'] = sandals.dress(rig, pieces, chiton)
        if name == 'watcher':
            report['armour'] = armour.dress(rig, pieces, chiton)
            report['pteruges_vertices_moved_out'] = garments.clear(pieces['pteruges'], ctx['outline'])
            report['fringe_faces_removed'] = garments.trim_fringe(pieces['hair'], pieces['eyes'])
        report['skin_vertices_under_chiton'] = garments.hide_skin(pieces['body'], ctx['skin'])
        return report
    return dress


def per_material(meshes):
    counts = {}
    for mesh in meshes:
        for p in mesh.data.polygons:
            name = mesh.data.materials[p.material_index].name
            counts[name] = counts.get(name, 0) + len(p.vertices) - 2
    return counts


summary = {'clips': {}, 'bodies': {}, 'cuts': {}}
for name in args.bodies.split(','):
    spec = bodies.BODIES[name]
    hair = dict(h.split('=', 1) for h in args.hair).get(name)
    rig, basemesh, parts, record = bodies.build(name, args.assets, hair)
    tex_dir = out_dir / f'{name}-textures'
    tex_dir.mkdir(exist_ok=True)
    files = record['files']
    mhmats = {'body': files['skin']['path'], 'eyes': files['eye_material']['path']}
    record['textures'] = []
    for role, obj in parts.items():
        mhmat = Path(args.assets) / (mhmats[role] if role in mhmats else files[role]['mhmat'])
        mat, row = materials.material(name, role, mhmat, tex_dir, spec['skin_rgb'] if role == 'body' else None)
        materials.assign(obj, mat)
        if role not in materials.TILES:
            record['textures'].append(row)
    record['textures'].append(materials.atlas(name, parts, tex_dir))
    skeleton, meshes, rig_report = rig21.to_game(rig, parts, ref, BUDGETS, spec['chest'], dresser(name, tex_dir, record['textures']))
    skeleton.name, meshes[0].name = f'{name} rig', name
    record['mesh_validate_fixed'] = [m.data.validate() for m in meshes]  # decimation can leave degenerate faces
    record.update(rig_report)
    record['triangles_total'] = sum(len(p.vertices) - 2 for m in meshes for p in m.data.polygons)
    record['triangles_by_material'] = per_material(meshes)
    record['meshes'] = [m.name for m in meshes]
    record['vertices'] = sum(len(m.data.vertices) for m in meshes)
    bpy.data.objects.remove(basemesh, do_unlink=True)
    glb = out_dir / f'{name}.glb'
    export(meshes, skeleton, glb)
    record['glb_bytes_mesh_only'] = glb.stat().st_size
    rest, clips, travel, sources = cliplist.heads(skeleton), {}, {}, {}
    for game, (library, source) in cliplist.CLIPS[name].items():
        lib_rig, _, lib_clips = libraries[library]
        clips[game], sources[game] = sample(lib_rig, lib_clips[source], record['leg_m'] / ual_leg), f'{library}/{source}'
        if game == cliplist.SPLIT:
            clips[game], tail, frame = cliplist.split(clips[game], rest)
            sources[game] += f' frames 0-{frame}'
            if name in cliplist.KEEP_TAIL:
                clips[game + 'Rec'], sources[game + 'Rec'] = tail, f'{library}/{source} frames {frame}-end'
    for game, clip in clips.items():
        travel[game] = inplace.in_place(clip, vertical=args.flatten_vertical)
    summary['cuts'][name] = {c: cliplist.marks(clips[c], rest) for c in cliplist.CUTS if c in clips}
    glbclips.embed(str(glb), clips, NAMES)
    record['glb_bytes'] = glb.stat().st_size
    record['glb_sha256'] = hashlib.sha256(glb.read_bytes()).hexdigest()
    record['hip_scale'] = round(record['leg_m'] / ual_leg, 4)
    summary['clips'][name] = {g: {'source': sources[g], 'seconds': round(c['times'][-1], 3), 'frames': len(c['times']),
                                  'pelvis': travel[g]} for g, c in clips.items()}
    summary['bodies'][name] = record
    bpy.data.objects.remove(rig, do_unlink=True)
    print('REAL_BODY', name, json.dumps({k: record[k] for k in ('height_m', 'triangles_total', 'triangles_by_material', 'meshes',
                                                               'glb_bytes', 'chest_above_pelvis_m', 'triangles')}))
    print('CUTS', name, json.dumps({c: {k: v for k, v in m.items() if k != 'speeds'} for c, m in summary['cuts'][name].items()}))

(out_dir / 'report.json').write_text(json.dumps(summary, indent=2) + '\n')
assetjson.write(out_dir / 'report.json', out_dir / 'asset.json')
print('REAL_BODIES_DONE', out_dir / 'report.json')
