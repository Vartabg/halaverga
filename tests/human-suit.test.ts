import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildSuitRig } from '../src/world/suitRig';
import { applySuitPose } from '../src/world/suitPose';
const asset = async () => {
  const b = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
};
test('the human eyes face -Z, away from a +Z chase camera, for every heading', async () => {
  const rig = buildSuitRig(await asset());
  try {
    let eyes: Mesh | undefined;
    rig.root.traverse(o => { if (o instanceof Mesh && (o.material as MeshStandardMaterial).name === 'visor') eyes = o; });
    expect(eyes).toBeDefined();
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      rig.root.rotation.y = yaw; rig.root.updateMatrixWorld(true);
      const front = new Box3().setFromObject(eyes!, true).getCenter(new Vector3());
      const head = rig.joints[1].getWorldPosition(new Vector3());
      expect(front.sub(head).dot(new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)))).toBeGreaterThan(.1);
    }
  } finally { rig.dispose(); }
});
test('the main body surface has no detached torso or limb sections', async () => {
  const rig = buildSuitRig(await asset());
  try {
    let body: SkinnedMesh | undefined;
    rig.root.traverse(o => { if (o instanceof SkinnedMesh && (o.material as MeshStandardMaterial).name === 'ceramic') body = o; });
    const geometry = body!.geometry, p = geometry.attributes.position, index = geometry.index;
    const parent = Array.from({ length: p.count }, (_, i) => i), positions = new Map<string, number>();
    const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const union = (a: number, b: number) => { parent[find(a)] = find(b); };
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(5)).join(',');
      if (positions.has(key)) union(i, positions.get(key)!); else positions.set(key, i);
    }
    const count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const a = index?.getX(i) ?? i, b = index?.getX(i + 1) ?? i + 1, c = index?.getX(i + 2) ?? i + 2;
      union(a, b); union(a, c);
    }
    const groups = new Map<number, number>();
    for (let i = 0; i < p.count; i++) groups.set(find(i), (groups.get(find(i)) ?? 0) + 1);
    expect(Math.max(...groups.values()) / p.count).toBeGreaterThan(.98);
  } finally { rig.dispose(); }
});
test('weighted poses remain finite and disposing a rig leaves the loaded source reusable', async () => {
  const source = await asset(); let sourceDisposals = 0;
  source.traverse(o => {
    if (!(o instanceof Mesh)) return;
    o.geometry.addEventListener('dispose', () => sourceDisposals++);
    (o.material as MeshStandardMaterial).addEventListener('dispose', () => sourceDisposals++);
  });
  for (let n = 0; n < 3; n++) {
    const rig = buildSuitRig(source);
    for (const brake of [0, .5, 1]) {
      applySuitPose(rig.joints, { viewYaw: 0, viewPitch: 0, yaw: 0, lean: -1.35, bank: .3, speed: 34, flight: 1, brake }, { hero: 1, climb: .8, epoch: 0 }, false);
      rig.root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(rig.root, true), size = bounds.getSize(new Vector3());
      expect([size.x, size.y, size.z].every(v => Number.isFinite(v) && v < 3)).toBe(true);
    }
    rig.dispose();
  }
  expect(sourceDisposals).toBe(0);
});
