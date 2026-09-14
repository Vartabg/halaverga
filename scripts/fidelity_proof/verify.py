"""Fail closed on proof artifacts; visual approval remains a separate human gate."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
proof = ROOT/'art/fidelity-proof/character.blend'
assert proof.exists(), 'The editable Blender proof is missing.'
audit = json.loads((ROOT/'docs/art/fidelity-proof/audit.json').read_text())
assert audit['blender_reopened'] and audit['packed_reference']
assert audit['body_topology_preserved'] and audit['no_image_materials']
assert audit['no_rig'] and audit['same_geometry_across_views']
assert audit['references_excluded_from_renders']
assert hashlib.sha256(proof.read_bytes()).hexdigest()==audit['blend_sha256'], 'Stale render audit.'
document = ROOT/'docs/art/fidelity-proof'
reference = json.loads((document/'reference.json').read_text())
assert hashlib.sha256((ROOT/reference['image']).read_bytes()).hexdigest()==reference['sha256']
output = document/('pass-'+str(audit['revision']))
manifest = json.loads((output/'renders.json').read_text())
assert len(manifest)==6 and len({v['geometry_hash'] for v in manifest.values()})==1
for view in manifest: assert (output/(view+'.png')).is_file()
for view in ['front','profile','back']:
    for prefix in ['compare-','overlay-','silhouette-']: assert (output/(prefix+view+'.png')).is_file()
for name, expected in audit['runtime_hashes'].items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == expected, name
changed = subprocess.check_output(['git', 'diff', '--name-only', 'codex/reference-hero', '--', 'src', 'public', 'package.json', 'pnpm-lock.yaml'], cwd=ROOT, text=True)
assert not changed.strip(), 'Runtime files changed: '+changed
print('[Proof] Technical checks → passed; visual judgment is pending owner review.')
