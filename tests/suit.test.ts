import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { buildSuitParts, parents, pivots } from '../src/world/suitGeometry';
import { BONE_COUNT, BONE_NAMES, BONE_PARENTS, boneIndex } from '../src/world/suitSkeleton';
test('human suit preserves weighted articulation, fitted proportions and the browser budget', async () => {
  const bytes = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  // Two compact embedded atlases replace the old untextured mannequin finish.
  expect(bytes.length).toBeLessThan(850_000);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  expect(json.images).toHaveLength(2);
  // Motion is authored in code, so the asset carries none. Every bone rests at identity, and one set of four weights skins each vertex.
  expect(json.animations).toBeUndefined();
  expect(json.skins).toHaveLength(1); expect(json.skins[0].joints).toHaveLength(BONE_COUNT);
  for (const joint of json.skins[0].joints) { expect(json.nodes[joint].rotation).toBeUndefined(); expect(json.nodes[joint].scale).toBeUndefined(); }
  // The runtime rebuilds the hierarchy from BONE_PARENTS, so it must match the exported one bone for bone.
  const parentOf = new Map<number, number>();
  json.nodes.forEach((node: { children?: number[] }, i: number) => node.children?.forEach(child => parentOf.set(child, i)));
  const exported = json.skins[0].joints.map((joint: number) => {
    const parent = parentOf.get(joint);
    return [json.nodes[joint].name, parent !== undefined && json.skins[0].joints.includes(parent) ? json.nodes[parent].name : null];
  });
  expect(new Map(exported)).toEqual(new Map(BONE_NAMES.map((name, i) => [name, BONE_PARENTS[i] < 0 ? null : BONE_NAMES[BONE_PARENTS[i]]])));
  expect(json.skins[0].joints.map((joint: number) => boneIndex(json.nodes[joint].name)).sort((a: number, b: number) => a - b)).toEqual(BONE_NAMES.map((_, i) => i));
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) expect(primitive.attributes.JOINTS_1).toBeUndefined();
  for (const image of json.images) {
    expect(image.uri).toBeUndefined();
    expect(image.mimeType).toBe('image/png');
    expect(json.bufferViews[image.bufferView].byteLength).toBeLessThan(150_000);
  }
  const source = await loadSuit();
  const rig = buildSuitRig(source.scene);
  try {
    rig.root.updateMatrixWorld(true);
    const size = new Box3().setFromObject(rig.root, true).getSize(new Vector3());
    expect(rig.joints).toHaveLength(BONE_COUNT);
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
          expect(w).toBeGreaterThanOrEqual(0); expect(joint).toBeLessThan(BONE_COUNT);
          sum += w; if (w > .01) { influences++; usedJoints.add(joint); }
        }
        expect(sum).toBeCloseTo(1, 5); if (influences > 1) blendedVertices++;
      }
    });
    expect(blendedVertices).toBeGreaterThan(100); expect(usedJoints.size).toBe(BONE_COUNT);
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
test('assembly keeps texture coordinates when textured and stays mergeable when mixed', () => {
  expect(parents).toHaveLength(pivots.length);
  parents.forEach((parent, i) => {
    expect(parent).toBeLessThan(i);
    if (parent >= 0) expect(parent).toBeLessThan(pivots.length);
  });
  const riggedScene = (mixedBatch: boolean) => {
    const scene = new Group(), material = new MeshStandardMaterial();
    const addPart = (i: number, withUv: boolean) => {
      const geometry = new BoxGeometry();
      if (!withUv) geometry.deleteAttribute('uv');
      const part = new Mesh(geometry, material); part.userData.suitPart = i;
      const p = pivots[i]; part.position.set(p[0], p[1], p[2]); scene.add(part);
    };
    for (let i = 0; i < pivots.length; i++) addPart(i, true);
    // A second piece in batch 0 without coordinates forces that batch back to untextured.
    if (mixedBatch) addPart(0, false);
    return scene;
  };
  const textured = buildSuitParts(riggedScene(false));
  try {
    expect(textured.parts.flat().length).toBeGreaterThan(0);
    textured.parts.flat().forEach(p => expect(p.geometry.getAttribute('uv')).toBeDefined());
  } finally {
    textured.parts.flat().forEach(p => p.geometry.dispose()); textured.materials.forEach(m => m.dispose());
  }
  const mixed = buildSuitParts(riggedScene(true));
  try {
    mixed.parts[0].forEach(p => expect(p.geometry.getAttribute('uv')).toBeUndefined());
    mixed.parts.slice(1).flat().forEach(p => expect(p.geometry.getAttribute('uv')).toBeDefined());
  } finally {
    mixed.parts.flat().forEach(p => p.geometry.dispose()); mixed.materials.forEach(m => m.dispose());
  }
});
