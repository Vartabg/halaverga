"""art/real-bodies/asset.json from a build's report.json (build.py calls it; it also runs alone with plain Python):
  python3 assetjson.py <build dir>/report.json <out>/asset.json
Per body: the GLB (bytes, sha256), triangles, vertices, meshes, materials, textures, the clips under their game names, each cut's
`raised` and `impact` (clips.py; src/world/cutClips.ts pins them) and every source asset with the licence its own file states and
the licence its pack states.
"""
import json
import sys
from pathlib import Path

MADE_HERE = 'made by scripts/real_bodies from the body surface (garments.py, skirt.py, sandals.py, armour.py); no third-party asset'


def asset(report):
    out = {}
    for name, b in report['bodies'].items():
        sources = {role: {'path': f['path'], 'file_says': f.get('file_says'), 'author': f.get('file_author'),
                          'pack': (f.get('pack_note') or {}).get('pack'), 'pack_says': (f.get('pack_note') or {}).get('licence'),
                          'pack_author': (f.get('pack_note') or {}).get('author'), 'url': (f.get('pack_note') or {}).get('source')}
                   for role, f in b['files'].items()}
        made = {'chiton': MADE_HERE, 'sandals': MADE_HERE} | ({'plate': MADE_HERE, 'bronze': MADE_HERE, 'pteruges': MADE_HERE}
                                                              if 'plate' in b['meshes'] else {})
        if name == 'archangel':
            made['chiton'] = ('cut, bound hems, diamond clasp and leather wrap built around the body by '
                              'scripts/real_bodies/{archangel_cloth,garments,skirt}.py')
        out[name] = {
            'file': f'{name}.glb', 'bytes': b['glb_bytes'], 'sha256': b['glb_sha256'], 'meshes': b['meshes'],
            'height_m': b['height_m'], 'triangles': b['triangles_total'], 'vertices': b['vertices'],
            'triangles_by_material': b['triangles_by_material'], 'materials': list(b['triangles_by_material']),
            'textures': {t['material']: {'file': t['file'], 'size': t['size'], 'bytes': t['bytes']} for t in b['textures']},
            'scale_to_library': b['hip_scale'], 'chest_above_pelvis_m': b['chest_above_pelvis_m'],
            'clips': {clip: {k: c[k] for k in ('source', 'seconds', 'frames')} for clip, c in report['clips'][name].items()},
            'cuts': {cut: {k: m[k] for k in ('raised', 'impact')} for cut, m in report['cuts'][name].items()},
            'clip_pelvis': 'horizontal travel removed, height as the source' if all('y' not in c['pelvis'] for c in
                                                                                   report['clips'][name].values())
                           else 'horizontal travel removed, vertical drift removed and capped',
            'sources': sources, 'made_here': made}
    return out


def write(report_path, out_path):
    Path(out_path).write_text(json.dumps(asset(json.loads(Path(report_path).read_text())), indent=2) + '\n')


if __name__ == '__main__':
    write(sys.argv[1], sys.argv[2])
