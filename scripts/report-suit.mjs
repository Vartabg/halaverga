import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const root = new URL('../', import.meta.url);
const bytes = await readFile(new URL('public/models/suit.glb', root));
const loader = new GLTFLoader();
loader.register(() => ({ name: 'ReportWithoutImageDecode', loadTexture: async () => new Texture() }));
const source = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
source.scene.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(source.scene, true), head = new Box3();
let triangles = 0, batches = 0;
const materials = new Set(), joints = {};
source.scene.traverse(object => {
  if (!(object instanceof SkinnedMesh)) return;
  batches++; materials.add(object.material.name);
  triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  if (['skin', 'hair'].includes(object.material.name)) head.union(new Box3().setFromObject(object, true));
  for (const bone of object.skeleton.bones) joints[bone.name] = bone.getWorldPosition(new Vector3()).toArray();
});
const paths = ['public/models/suit.glb', 'art/halaverga-explorer.blend', 'scripts/build-suit.py', 'scripts/hero_anatomy.py', 'scripts/hero_face.py',
  'scripts/hero_armor.py', 'scripts/hero_skin.py', 'scripts/hero_color.py', 'scripts/suit_mesh.py',
  'src/world/suitGeometry.ts', 'docs/art/explorer-reference.png', 'docs/art/explorer-face-reference.png'];
const hashes = {};
for (const path of paths) hashes[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
const report = { bytes: bytes.length, triangles, batches, materials: [...materials], joints,
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new Vector3()).toArray() },
  headCount: bounds.getSize(new Vector3()).y / head.getSize(new Vector3()).y, sourceHashes: hashes };
await writeFile(new URL('docs/performance/reference-hero-asset.json', root), JSON.stringify(report, null, 2) + '\n');
console.log('[Explorer] Asset report →', JSON.stringify({ bytes: bytes.length, triangles, batches, headCount: report.headCount }));
