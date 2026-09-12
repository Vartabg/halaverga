import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildSuitParts, pivots } from '../src/world/suitGeometry';
test('authored suit preserves six pivots, fitted proportions and distinct finishes within the asset budget', async () => {
  const bytes = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  expect(bytes.length).toBeLessThan(600_000);
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  source.scene.updateMatrixWorld(true);
  for (const [x, y] of [[.10,.36], [.119,-.40], [.119,-.75], [.325,-.14]]) {
    const ray = new Raycaster(new Vector3(x,y,-2), new Vector3(0,0,1));
    const hit = ray.intersectObject(source.scene, true)[0];
    expect(((hit.object as Mesh).material as MeshStandardMaterial).name).toBe('ceramic');
  }
  const result = buildSuitParts(source.scene);
  expect(result.parts).toHaveLength(6);
  const bounds = new Box3(), materialNames = result.materials.map(m => m.name);
  expect(materialNames).toEqual(expect.arrayContaining(['ceramic', 'textile', 'visor', 'energy']));
  expect(result.materials.find(m => m.name === 'energy')!.emissiveIntensity).toBeGreaterThan(0);
  let triangles = 0, batches = 0;
  result.parts.forEach((part, i) => {
    expect(part.length).toBeGreaterThan(0);
    part.forEach(({ geometry, material }) => {
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!.clone().translate(new Vector3(...pivots[i])));
      expect(material.isMeshStandardMaterial).toBe(true);
      const positions = geometry.getAttribute('position').array;
      expect(Array.from(positions).every(Number.isFinite)).toBe(true);
      triangles += geometry.getAttribute('position').count / 3; batches++;
    });
  });
  const size = bounds.getSize(new Vector3());
  expect(size.y).toBeGreaterThan(1.9); expect(size.y).toBeLessThan(2.1);
  expect(size.x).toBeLessThan(.95); expect(size.z).toBeLessThan(.48);
  expect(triangles).toBeLessThan(20_000); expect(batches).toBeLessThanOrEqual(30);
  result.parts.flat().forEach(p => p.geometry.dispose()); result.materials.forEach(m => m.dispose());
});
test('assembly rejects missing parts and never disposes or mutates shared loader assets', () => {
  const scene = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  let sourceDisposals = 0;
  geometry.addEventListener('dispose', () => sourceDisposals++);
  material.addEventListener('dispose', () => sourceDisposals++);
  for (let i = 0; i < 6; i++) {
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
