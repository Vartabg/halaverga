"""Fetch CC0 authoring inputs into a disposable cache; verify provider checksums."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess

CACHE = Path('/tmp/halaverga-environment-sources')
ROOT = Path(__file__).resolve().parents[2]
NAMES = ['island_tree_01', 'shrub_01', 'concrete_moss', 'concrete_floor_02']


def get(url, path, md5=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        subprocess.run(['curl', '-sS', '--fail', '--retry', '2', '-A',
                        'Halaverga local art development', url, '-o', str(path)], check=True)
    raw = path.read_bytes()
    if md5 and hashlib.md5(raw).hexdigest() != md5:
        raise ValueError(f'Checksum mismatch: {path}')
    return hashlib.sha256(raw).hexdigest()


manifest = []
for name in NAMES:
    folder = CACHE / name
    meta_path = folder / 'files.json'
    get(f'https://api.polyhaven.com/files/{name}', meta_path)
    info_path = folder / 'info.json'
    get(f'https://api.polyhaven.com/info/{name}', info_path)
    info = json.loads(info_path.read_text())
    data = json.loads(meta_path.read_text())
    files = data['gltf']['1k']['gltf']
    inputs = dict(files['include'])
    if 'tree' in name or 'shrub' in name:
        inputs[name + '_1k.gltf'] = {k: v for k, v in files.items() if k != 'include'}
    else:
        inputs = {k: v for k, v in inputs.items() if k.endswith('.jpg')}

    def download(item):
        filename, item = item
        sha = get(item['url'], folder / filename, item['md5'])
        return {'path': filename, **item, 'sha256': sha}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        downloaded = list(pool.map(download, inputs.items()))
    manifest.append({'id': name, 'source': f'https://polyhaven.com/a/{name}',
                     'license': 'CC0-1.0', 'licenseURL': 'https://polyhaven.com/license',
                     'authors': info.get('authors'), 'inputs': downloaded})
    print(name, 'downloaded', flush=True)

dest = ROOT / 'docs/art/reclaimed-boulevard/sources.json'
dest.write_text(json.dumps(manifest, indent=2) + '\n')
