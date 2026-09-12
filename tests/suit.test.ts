import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildSuitRig } from '../src/world/suitRig';
import { buildSuitParts, pivots } from '../src/world/suitGeometry';
test('human suit preserves weighted articulation, fitted proportions and the browser budget', async () => {
  const bytes = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  expect(bytes.length).toBeLessThan(600_000);
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const rig = buildSuitRig(source.scene);
  try {
    rig.root.updateMatrixWorld(true);
    const size = new Box3().setFromObject(rig.root, true).getSize(new Vector3());
    expect(rig.joints).toHaveLength(10);
    expect(size.y).toBeGreaterThan(1.9); expect(size.y).toBeLessThan(2.1);
    expect(size.x).toBeLessThan(.95); expect(size.z).toBeLessThan(.48);
    let triangles = 0, batches = 0, blendedVertices = 0;
    const finishes = new Set<string>(), usedJoints = new Set<number>();
    rig.root.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      batches++; const geometry = object.geometry;
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      finishes.add((object.material as MeshStandardMaterial).name);
      const weights = geometry.getAttribute('skinWeight'), indices = geometry.getAttribute('skinIndex');
      expect(Array.from(geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < weights.count; i++) {
        let sum = 0, influences = 0;
        for (let n = 0; n < 4; n++) {
          const w = weights.getComponent(i, n), joint = indices.getComponent(i, n);
          expect(w).toBeGreaterThanOrEqual(0); expect(joint).toBeLessThan(10);
          sum += w; if (w > .01) { influences++; usedJoints.add(joint); }
        }
        expect(sum).toBeCloseTo(1, 5); if (influences > 1) blendedVertices++;
      }
    });
    expect(blendedVertices).toBeGreaterThan(100); expect(usedJoints.size).toBe(10);
    expect(triangles).toBeLessThan(20_000); expect(batches).toBeLessThanOrEqual(8);
    expect(finishes).toEqual(new Set(['ceramic', 'textile', 'visor', 'energy', 'copper', 'skin', 'hair', 'eyes']));
  } finally { rig.dispose(); }
});
test('assembly rejects missing parts and never disposes or mutates shared loader assets', () => {
  const scene = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  let sourceDisposals = 0;
  geometry.addEventListener('dispose', () => sourceDisposals++);
  material.addEventListener('dispose', () => sourceDisposals++);
  for (let i = 0; i < pivots.length; i++) {
    const part = new Mesh(geometry, material); part.userData.suitPart = i;
    const p = pivots[i]; part.position.set(p[0], p[1], p[2]); scene.add(part);
  }
  const originalPosition = Array.from(geometry.attributes.position.array);
  for (let i = 0; i < 3; i++) {
    const assembly = buildSuitParts(scene);
    assembly.parts.flat().forEach(p => p.geometry.dispose()); assembly.materials.forEach(m => m.dispose());
  }
  scene.remove(scene.children[5]);
  expect(() => buildSuitParts(scene)).toThrow('missing an articulated body part');
  expect(sourceDisposals).toBe(0);
  expect(Array.from(geometry.attributes.position.array)).toEqual(originalPosition);
  geometry.dispose(); material.dispose();
});
