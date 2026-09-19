import { expect, test } from 'vitest';
import { SkinnedMesh, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';

test('the lower legs never receive arm weights from the A-pose fitting region', async () => {
  const rig = buildSuitRig((await loadSuit()).scene);
  try {
    let checked = 0;
    rig.root.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      const p = o.geometry.attributes.position, weights = o.geometry.attributes.skinWeight, indices = o.geometry.attributes.skinIndex;
      for (let i = 0; i < p.count; i++) {
        // Below even the longest fingertip in the relaxed stance.
        if (p.getY(i) >= -.35) continue;
        checked++;
        // This catches both accidental arm fitting of calves and wrong skin influences.
        expect(Math.abs(p.getX(i))).toBeLessThan(.25);
        for (let n = 0; n < 4; n++) {
          if (weights.getComponent(i, n) < .001) continue;
          expect(BONE_NAMES[indices.getComponent(i, n)]).toMatch(/^(thigh|shin|foot|toe)_[lr]$/);
        }
      }
    });
    expect(checked).toBeGreaterThan(1000);
  } finally { rig.dispose(); }
});

test('rebinding preserves every vertex at rest, including the anatomy-fitted heads', async () => {
  const source = (await loadSuit()).scene, rig = buildSuitRig(source);
  source.updateMatrixWorld(true); rig.root.updateMatrixWorld(true);
  try {
    const meshes: SkinnedMesh[] = [];
    source.traverse(o => { if (o instanceof SkinnedMesh) meshes.push(o); });
    let next = 0, checked = 0, worst = 0;
    const a = new Vector3(), b = new Vector3();
    rig.root.traverse(o => {
      if (!(o instanceof SkinnedMesh)) return;
      const original = meshes[next++];
      expect(o.geometry.attributes.position.count).toBe(original.geometry.attributes.position.count);
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        original.getVertexPosition(i, a).applyMatrix4(original.matrixWorld);
        o.getVertexPosition(i, b).applyMatrix4(o.matrixWorld);
        worst = Math.max(worst, a.distanceTo(b)); checked++;
      }
    });
    expect(checked).toBeGreaterThan(20_000);
    expect(worst).toBeLessThan(.000001);
  } finally { rig.dispose(); }
});
