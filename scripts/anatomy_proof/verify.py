"""Verify saved/rendered artifacts without claiming subjective visual acceptance."""
import ast
import hashlib
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/art/parker-anatomy'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


audit = json.loads((DOC/'audit.json').read_text())
renders = json.loads((DOC/'renders.json').read_text())
comparison = json.loads((DOC/'comparison.json').read_text())
blend = ROOT/'art/parker-anatomy/character.blend'
assert sha(blend) == audit['blend_sha256'] == renders['blend_sha256']
assert sha(ROOT/'art/fidelity-proof/character.blend') == audit['source_file_sha256']
assert audit['saved_file_reopened'] and audit['runtime_unchanged'] and audit['no_armature']
assert audit['no_image_materials']
assert audit['visual_acceptance'] == 'Pending owner review'
assert set(renders['views']) == {'front', 'side', 'back', 'three-quarter', 'torso', 'gameplay-scale'}
assert len({v['geometry_sha256'] for v in renders['views'].values()}) == 1
for name, metadata in renders['views'].items():
    image = DOC/(name+'.png')
    data = image.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert list(struct.unpack('>II', data[16:24])) == metadata['size']
    assert sha(image) == metadata['image_sha256']
for path, fingerprint in audit['runtime_hashes'].items():
    assert sha(ROOT/path) == fingerprint, 'Runtime changed: '+path
assert sha(ROOT/comparison['source']) == comparison['source_sha256']
assert sha(DOC/'previous-front.png') == comparison['image_sha256']
for source in (ROOT/'scripts/anatomy_proof').glob('*.py'):
    text = source.read_text()
    assert len(text.splitlines()) < 200, source
    ast.parse(text)
status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=ROOT, text=True)
allowed = ('art/parker-anatomy/', 'docs/art/parker-anatomy/', 'scripts/anatomy_proof/')
assert all(line[3:].startswith(allowed) for line in status.splitlines()), 'Unexpected files changed: '+status
subprocess.run(['git', 'diff', '--check'], cwd=ROOT, check=True)
print('PASS: reopened Blender file, six direct renders, identical geometry across views,')
print('source provenance, previous-model comparison, module limits, isolated scope, unchanged game asset and runtime.')
print('Visual acceptance remains pending owner review.')
