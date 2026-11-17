import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createMembraneRig } from '../src/world/membraneRig';
import { buildDroneGeometry } from '../src/world/droneMesh';
import { AVIAN_JOINTS } from '../src/world/featherGeometry';
import { WATCHER_JOINTS, WATCHER_WING, wingWeights } from '../src/world/watcherWings';
let geometry: ReturnType<typeof buildDroneGeometry>;
beforeAll(() => { geometry = buildDroneGeometry(); });
const point = (side: number, joint: number) => { const p = WATCHER_JOINTS[joint]; return new Vector3(side * p[0], p[1], p[2]); };
describe('the instanced wing rig on the Watchers\' feather wings', () => {
  it('takes its hinges from AVIAN_JOINTS at the Watcher\'s wing scale, from the shoulder root', () => {
    expect(WATCHER_JOINTS).toHaveLength(3);
    WATCHER_JOINTS.forEach((j, k) => j.forEach((v, axis) => expect(v).toBeCloseTo(WATCHER_WING.root[axis] + AVIAN_JOINTS[k][axis] * WATCHER_WING.scale, 9)));
  });
  it('holds both shoulders in place and preserves humerus/forearm lengths throughout a wingbeat', () => {
    const r = createMembraneRig(WATCHER_JOINTS);
    for (const t of [0, .08, .19, .31, .43, .57]) for (const side of [-1, 1]) {
      r.step(0, t, 2, false); const base = side < 0 ? 0 : 4;
      const shoulder = point(side, 0).applyMatrix4(r.palette[base + 1]);
      const elbow = point(side, 1).applyMatrix4(r.palette[base + 2]);
      const wrist = point(side, 2).applyMatrix4(r.palette[base + 3]);
      expect(shoulder.distanceTo(point(side, 0))).toBeLessThan(1e-6);
      expect(elbow.distanceTo(shoulder)).toBeCloseTo(point(side, 1).distanceTo(point(side, 0)), 6);
      expect(wrist.distanceTo(elbow)).toBeCloseTo(point(side, 2).distanceTo(point(side, 1)), 6);
    } r.dispose();
  });
  it('weights the feathers to shoulder, elbow and wrist along the span, never to the fixed flank', () => {
    const w: number[] = [];
    expect(wingWeights(WATCHER_WING.root[0], w)).toEqual([0, 1, 0, 0]); // at the shoulder
    expect(wingWeights(WATCHER_WING.root[0] + .75 * WATCHER_WING.scale, w)).toEqual([0, 0, 1, 0]); // mid forearm
    expect(wingWeights(-(WATCHER_WING.root[0] + 1.6 * WATCHER_WING.scale), w)).toEqual([0, 0, 0, 1]); // the hand, either side
    for (const g of [geometry.wingL, geometry.wingR]) {
      const a = g.attributes.aWingWeights; let elbow = 0, wrist = 0;
      for (let i = 0; i < a.count; i++) { expect(a.getX(i)).toBe(0); elbow += a.getZ(i); wrist += a.getW(i); }
      expect(elbow).toBeGreaterThan(a.count * .1); expect(wrist).toBeGreaterThan(a.count * .1); // both outer joints carry feathers
    }
  });
  it('moves the wrist without separating the root, and holds a constant pose for reduced motion', () => {
    const r = createMembraneRig(WATCHER_JOINTS), before = r.palette[3].clone(); r.step(0, .16, 2, false);
    expect(r.palette[3].equals(before)).toBe(false);
    r.step(0, 1, 3, true); const held = r.texture.image.data!.slice(); r.step(0, 8, 3, true);
    expect(r.texture.image.data).toEqual(held); r.dispose();
  });
  it('keeps the shader palette texture small and releases it', () => {
    const r = createMembraneRig(WATCHER_JOINTS); expect(r.texture.image.width).toBe(4); expect(r.texture.image.height).toBe(64);
    let disposed = false; r.texture.addEventListener('dispose', () => { disposed = true; }); r.dispose(); expect(disposed).toBe(true);
  });
});
