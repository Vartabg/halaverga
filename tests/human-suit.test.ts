import { expect, test } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { applySuitPose } from '../src/world/suitPose';
const asset = async () => (await loadSuit()).scene;
test('anatomical joints give the explorer balanced legs and arms', async () => {
  const rig = buildSuitRig(await asset());
  try {
    rig.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rig.root, true), height = bounds.max.y - bounds.min.y;
    const shoulder = rig.joints[2].getWorldPosition(new Vector3());
    const elbow = rig.joints[6].getWorldPosition(new Vector3());
    const hip = rig.joints[4].getWorldPosition(new Vector3());
    const knee = rig.joints[8].getWorldPosition(new Vector3());
    expect((hip.y - bounds.min.y) / height).toBeGreaterThan(.47);
    expect((hip.y - bounds.min.y) / height).toBeLessThan(.54);
    expect((shoulder.y - elbow.y) / height).toBeGreaterThan(.15);
    expect((shoulder.y - elbow.y) / height).toBeLessThan(.19);
    expect((hip.y - knee.y) / (knee.y - bounds.min.y)).toBeGreaterThan(.87);
    expect((hip.y - knee.y) / (knee.y - bounds.min.y)).toBeLessThan(1.18);
  } finally { rig.dispose(); }
});
test('head and boots retain credible scale in the exported geometry', async () => {
  const source = await asset(), rig = buildSuitRig(source);
  try {
    rig.root.updateMatrixWorld(true); source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(rig.root, true), height = bounds.max.y - bounds.min.y;
    const head = new Box3(), foot = new Box3();
    rig.root.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      const material = (object.material as MeshStandardMaterial).name;
      if (material === 'skin' || material === 'hair') head.union(new Box3().setFromObject(object, true));
      const p = object.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -.90) foot.expandByPoint(new Vector3(p.getX(i), p.getY(i), p.getZ(i)));
      }
    });
    const headSize = head.getSize(new Vector3()), footSize = foot.getSize(new Vector3());
    expect(height / headSize.y).toBeGreaterThan(7.2);
    expect(height / headSize.y).toBeLessThan(8.2);
    expect(headSize.x / height).toBeGreaterThan(.08);
    expect(headSize.x / height).toBeLessThan(.105);
    expect(footSize.z / height).toBeGreaterThan(.11);
    expect(footSize.z / height).toBeLessThan(.155);
    source.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      for (const bone of object.skeleton.bones) {
        const index = Number(bone.name.split('_').at(-1));
        expect(bone.getWorldPosition(new Vector3()).distanceTo(rig.joints[index].getWorldPosition(new Vector3()))).toBeLessThan(.00001);
      }
    });
  } finally { rig.dispose(); }
});
test('the face preserves its embedded reference atlas and UVs', async () => {
  const rig = buildSuitRig(await asset());
  try {
    let skin: SkinnedMesh | undefined;
    rig.root.traverse(o => { if (o instanceof SkinnedMesh && (o.material as MeshStandardMaterial).name === 'skin') skin = o; });
    const material = skin!.material as MeshStandardMaterial;
    expect(material.map).not.toBeNull();
    expect(material.color.r).toBeCloseTo(1);
    const uv = skin!.geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(Array.from(uv.array).every(Number.isFinite)).toBe(true);
  } finally { rig.dispose(); }
});
test('the eye openings face -Z, away from a +Z chase camera, for every heading', async () => {
  const rig = buildSuitRig(await asset());
  try {
    let eyes: Mesh | undefined;
    rig.root.traverse(o => { if (o instanceof Mesh && (o.material as MeshStandardMaterial).name === 'eyes') eyes = o; });
    expect(eyes).toBeDefined();
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      rig.root.rotation.y = yaw; rig.root.updateMatrixWorld(true);
      const front = new Box3().setFromObject(eyes!, true).getCenter(new Vector3());
      const head = rig.joints[1].getWorldPosition(new Vector3());
      expect(front.sub(head).dot(new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)))).toBeGreaterThan(.065);
    }
  } finally { rig.dispose(); }
});
test('the main body surface has no detached torso or limb sections', async () => {
  const rig = buildSuitRig(await asset());
  try {
    let body: SkinnedMesh | undefined;
    rig.root.traverse(o => { if (o instanceof SkinnedMesh && (o.material as MeshStandardMaterial).name === 'textile') body = o; });
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
    (o.material as MeshStandardMaterial).map?.addEventListener('dispose', () => sourceDisposals++);
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
