import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { createArchangelWings, stepArchangelWings, WING_SCALE } from '../src/world/archangelWings';
function span(w: ReturnType<typeof createArchangelWings>) {
  w.root.updateMatrixWorld(true); const b = new Box3(), p = new Vector3();
  for (const wing of [w.left, w.right]) for (let i = 0; i < wing.mesh.geometry.attributes.position.count; i++) {
    wing.mesh.getVertexPosition(i, p); b.expandByPoint(p.applyMatrix4(wing.mesh.matrixWorld));
  }
  return b.max.x - b.min.x;
}
it('reduces the real skinned span and sweeps back for a dive, with pause and reopening', () => {
  const w = createArchangelWings();
  try {
    for (let i = 0; i < 180; i++) stepArchangelWings(w, true, false, false, 30, 0, 0, 1 / 60);
    const compact = span(w);
    w.left.root.scale.setScalar(1); w.right.root.scale.setScalar(1); const old = span(w);
    expect(compact / old).toBeLessThan(WING_SCALE + .05); // the shoulder spacing is unscaled, so the span ratio sits just above WING_SCALE
    w.left.root.scale.setScalar(WING_SCALE); w.right.root.scale.setScalar(WING_SCALE);
    for (let i = 0; i < 20; i++) stepArchangelWings(w, true, false, false, 90, 0, 0, 1 / 60, 0, true);
    expect(span(w)).toBeLessThan(compact * .75);
    const held = w.strikeFold; stepArchangelWings(w, true, true, false, 0, 0, 0, 1, 0, false);
    expect(w.strikeFold).toBe(held);
    for (let i = 0; i < 180; i++) stepArchangelWings(w, true, false, false, 30, 0, 0, 1 / 60);
    expect(span(w)).toBeCloseTo(compact, 2);
  } finally { w.dispose(); }
});
