import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createMembraneRig, membraneWeights, MEMBRANE_JOINTS } from '../src/world/membraneRig';
import { buildDroneGeometry } from '../src/world/droneMesh';
import { loadSuit } from './load-suit';
let geometry: ReturnType<typeof buildDroneGeometry>;
beforeAll(async () => { geometry = buildDroneGeometry((await loadSuit('abyssal')).scene); });
const point = (side: number, joint: number) => { const p = MEMBRANE_JOINTS[joint]; return new Vector3(side * p[0], p[1], p[2]); };
describe('anatomical membrane wing rig', () => {
  it('holds both shoulders in place and preserves humerus/forearm lengths throughout a wingbeat', () => {
    const r = createMembraneRig();
    for (const t of [0, .08, .19, .31, .43, .57]) for (const side of [-1, 1]) {
      r.step(0, t, 2, false); const base = side < 0 ? 0 : 4;
      const shoulder = point(side, 0).applyMatrix4(r.palette[base + 1]);
      const elbow = point(side, 1).applyMatrix4(r.palette[base + 2]);
      const wrist = point(side, 2).applyMatrix4(r.palette[base + 3]);
      expect(shoulder.distanceTo(point(side, 0))).toBeLessThan(1e-7);
      expect(elbow.distanceTo(shoulder)).toBeCloseTo(point(side, 1).distanceTo(point(side, 0)), 7);
      expect(wrist.distanceTo(elbow)).toBeCloseTo(point(side, 2).distanceTo(point(side, 1)), 7);
    } r.dispose();
  });
  it('uses normalized weights on the actual wing surfaces and a fixed torso attachment at the trailing inner edge', () => {
    const w: number[] = []; membraneWeights(.22, -.10, w); expect(w).toEqual([1, 0, 0, 0]);
    for (const g of [geometry.wingL, geometry.wingR]) {
      const a = g.attributes.aWingWeights;
      for (let i = 0; i < a.count; i++) expect(a.getX(i) + a.getY(i) + a.getZ(i) + a.getW(i)).toBeCloseTo(1, 6);
    }
    expect(geometry.body.attributes.aWingSide.array.every(v => v === 0)).toBe(true);
  });
  it('moves the wrist without separating the root, and holds a constant pose for reduced motion', () => {
    const r = createMembraneRig(), before = r.palette[3].clone(); r.step(0, .16, 2, false);
    expect(r.palette[3].equals(before)).toBe(false);
    r.step(0, 1, 3, true); const held = r.texture.image.data!.slice(); r.step(0, 8, 3, true);
    expect(r.texture.image.data).toEqual(held); r.dispose();
  });
  it('keeps the shader palette texture small and releases it', () => {
    const r = createMembraneRig(); expect(r.texture.image.width).toBe(4); expect(r.texture.image.height).toBe(64);
    let disposed = false; r.texture.addEventListener('dispose', () => { disposed = true; }); r.dispose(); expect(disposed).toBe(true);
  });
});
