import { expect, test } from 'vitest';
import { Matrix4, SkinnedMesh, Vector3 } from 'three';
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
  const source = (await loadSuit()).scene;
  source.updateMatrixWorld(true);
  const authored = new Map<number, Vector3>();
  source.traverse(o => { if (o instanceof SkinnedMesh) o.skeleton.bones.forEach(b => authored.set(boneIndex(b.name), b.getWorldPosition(new Vector3()))); });
  const rig = buildSuitRig(source);
  try {
    expect(rig.joints).toHaveLength(BONE_COUNT);
    rig.root.updateMatrixWorld(true);
    rig.joints.forEach((joint, i) => {
      expect(joint.quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(joint.getWorldPosition(new Vector3()).distanceTo(authored.get(i)!)).toBeLessThan(1e-12);
    });
  } finally { rig.dispose(); }
});
// The legacy joint each added bone's skin weight was carved from (OWNER in scripts/hero_skin.py).
const CARVED_FROM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 6, 7, 8, 9, 8, 9];
test('with the added bones at rest, the skin deforms exactly as its weights collapsed onto the ten legacy joints', async () => {
  const rig = buildSuitRig((await loadSuit()).scene);
  try {
    // Every added bone descends from the joint it was carved from through added bones only.
    BONE_NAMES.forEach((_, i) => {
      let ancestor = i;
      while (ancestor >= LEGACY_COUNT) ancestor = BONE_PARENTS[ancestor];
      expect(ancestor).toBe(CARVED_FROM[i]);
    });
    const angles = [[.3, -.2, .1], [1.1, .4, -.3], [-.6, .2, .5], [2.4, -.1, .2], [.2, .3, -.4], [-.3, .1, .2], [1.2, 0, 0], [.9, 0, 0], [-1.3, 0, 0], [-.7, 0, 0]];
    rig.joints.forEach((joint, i) => { if (i < LEGACY_COUNT) joint.rotation.set(angles[i][0], angles[i][1], angles[i][2]); });
    rig.root.updateMatrixWorld(true);
    let worst = 0, checked = 0;
    const skin = new Matrix4(), part = new Matrix4(), v = new Vector3(), expected = new Vector3();
    rig.root.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      const { bones, boneInverses } = object.skeleton, position = object.geometry.attributes.position;
      const indices = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight;
      for (let i = 0; i < position.count; i++) {
        skin.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (let n = 0; n < 4; n++) {
          const owner = CARVED_FROM[indices.getComponent(i, n)], weight = weights.getComponent(i, n);
          part.multiplyMatrices(bones[owner].matrixWorld, boneInverses[owner]);
          for (let e = 0; e < 16; e++) skin.elements[e] += part.elements[e] * weight;
        }
        expected.fromBufferAttribute(position, i).applyMatrix4(object.bindMatrix).applyMatrix4(skin).applyMatrix4(object.bindMatrixInverse);
        worst = Math.max(worst, object.getVertexPosition(i, v).distanceTo(expected)); checked++;
      }
    });
    expect(checked).toBeGreaterThan(10_000);
    expect(worst).toBeLessThan(1e-6);
  } finally { rig.dispose(); }
});
