"""Finalize the authored asset record from the actual compressed browser artifact."""
import hashlib
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
asset = root / 'public/models/environment/meridian-district.glb'
source = root / 'docs/art/blender-district/meridian-district.blend'
manifest = root / 'docs/art/blender-district/asset.json'
body = asset.read_bytes()
length = struct.unpack_from('<I', body, 12)[0]
gltf = json.loads(body[20:20+length])
report = json.loads(manifest.read_text())
report['rawBytes'] = report.pop('bytes', report.get('rawBytes', 0))
report['runtimeBytes'] = len(body)
report['runtimeSha256'] = hashlib.sha256(body).hexdigest()
report['blenderSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
report['compression'] = '@gltf-transform/cli 4.2.1; EXT_meshopt_compression; Three.js bundled MeshoptDecoder'
report['runtimeMeshes'] = len(gltf['meshes'])
report['runtimeMaterials'] = len(gltf['materials'])
report['extensionsRequired'] = gltf.get('extensionsRequired', [])
report['textureProvenance'] = '../reclaimed-boulevard/sources.json (existing Poly Haven CC0 concrete maps)'
manifest.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key: report[key] for key in ['runtimeBytes','triangles','runtimeMeshes','runtimeMaterials']}))
