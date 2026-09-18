import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { parents, pivots } from '../src/world/suitGeometry';
import { BONE_COUNT, BONE_HEADS, BONE_NAMES, BONE_PARENTS, LEGACY_COUNT, boneIndex } from '../src/world/suitSkeleton';
test('the legacy joints keep their indices and exact pivots', () => {
  expect(LEGACY_COUNT).toBe(10); expect(BONE_COUNT).toBe(21);
  expect(BONE_HEADS).toHaveLength(BONE_COUNT); expect(BONE_PARENTS).toHaveLength(BONE_COUNT);
  for (let i = 0; i < LEGACY_COUNT; i++) {
    expect(BONE_HEADS[i]).toBe(pivots[i]);
    // A legacy joint may now hang from an added bone, but only through a chain that leads back to its old parent.
    let ancestor = BONE_PARENTS[i];
    while (ancestor >= LEGACY_COUNT) ancestor = BONE_PARENTS[ancestor];
    expect(ancestor).toBe(parents[i]);
  }
});
test('the hierarchy is one acyclic tree with unique names', () => {
  expect(new Set(BONE_NAMES).size).toBe(BONE_COUNT);
  expect(BONE_PARENTS.filter(p => p < 0)).toHaveLength(1);
  BONE_PARENTS.forEach((_, i) => {
    const seen = new Set<number>();
    for (let bone = i; bone >= 0; bone = BONE_PARENTS[bone]) {
      expect(seen.has(bone)).toBe(false); seen.add(bone);
      expect(BONE_PARENTS[bone]).toBeLessThan(BONE_COUNT);
    }
  });
  BONE_NAMES.forEach(name => {
    // Left bones sit on the model's left (-X); right bones mirror them exactly.
    if (!/_[lr]$/.test(name)) { expect(BONE_HEADS[boneIndex(name)][0]).toBe(0); return; }
    const own = BONE_HEADS[boneIndex(name)], other = BONE_HEADS[boneIndex(name.replace(/_([lr])$/, (_, s) => s === 'l' ? '_r' : '_l'))];
    expect(Math.sign(own[0])).toBe(name.endsWith('_l') ? -1 : 1);
    expect([-other[0], other[1], other[2]]).toEqual([...own]);
  });
});
test('bone names resolve in both the current and the legacy form, and nothing else binds', () => {
  BONE_NAMES.forEach((name, i) => expect(boneIndex(name)).toBe(i));
  for (let i = 0; i < 10; i++) expect(boneIndex(`suit_joint_${i}`)).toBe(i);
  for (const name of ['suit_joint_10', 'head_1', 'Head', 'foo', '']) expect(() => boneIndex(name)).toThrow('unknown joints');
});
test('the playable rig rests at identity with every joint at its authored head', async () => {
  const rig = buildSuitRig((await loadSuit()).scene);
  try {
    expect(rig.joints).toHaveLength(BONE_COUNT);
    rig.root.updateMatrixWorld(true);
    rig.joints.forEach((joint, i) => {
      expect(joint.quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(joint.getWorldPosition(new Vector3()).distanceTo(new Vector3(...BONE_HEADS[i]))).toBeLessThan(1e-12);
    });
  } finally { rig.dispose(); }
});
