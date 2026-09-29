import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { init, Sim, WORLD } from './lim/harness';
import { boomBlocks } from '../src/game/boomFilter';
import { boomFor } from '../src/game/cameraFx';
import { Vector3 } from 'three';
// Limits plan S7: the chase camera's boom ignores the invisible district walls (they are flight colliders, not scenery), and still
// stops at real city solids. The same predicate CameraRig passes to castShape, in a Rapier world with the walls and the city.
beforeAll(init);
const identity = { x: 0, y: 0, z: 0, w: 1 };
const sims: Sim[] = [];
afterAll(() => sims.forEach(s => s.free()));
const boom = (s: Sim, head: { x: number; y: number; z: number }, dir: Vector3, length: number, probe = new RAPIER.Ball(.28), filter?: (c: RAPIER.Collider) => boolean) => {
  const hit = s.world.castShape(head, identity, { x: dir.x, y: dir.y, z: dir.z }, probe, .04, length, false, undefined, undefined, undefined, undefined, filter);
  return hit ? Math.max(0, hit.time_of_impact - .08) : length;
};
describe('camera boom at the district edge', () => {
  const desired = new Vector3(); boomFor(0, 852 / 393, desired, 1);
  const length = desired.length(), dir = desired.clone().normalize();
  it('has a real boom to test (the third-person boom is metres long)', () => { expect(length).toBeGreaterThan(2); });
  for (const [name, yaw] of [['+X', -Math.PI / 2], ['-Z', 0], ['+Z', Math.PI], ['-X', Math.PI / 2]] as const) {
    it(`${name} wall: a boom pointing at the wall from 1.6 m is as long as in open air (within 0.05 m)`, () => {
      const s = new Sim({ x: 0, y: 70, z: 0 }, { city: false }); sims.push(s);
      // The view faces away from the wall, so the boom (behind the head) points at it. dir is in the camera's frame: rotate it by yaw.
      const world = dir.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw + Math.PI);
      const wallAt = (d: number) => name === '+X' ? { x: WORLD.maxX - d, y: 70, z: 0 } : name === '-X' ? { x: WORLD.minX + d, y: 70, z: 0 } : name === '-Z' ? { x: 0, y: 70, z: WORLD.minZ + d } : { x: 0, y: 70, z: WORLD.maxZ - d };
      // A head 1.6 m inside the face: what the pinned suit gives (stop 1.14 m + the chase head offset).
      const open = boom(s, wallAt(30), world, length, undefined, boomBlocks), near = boom(s, wallAt(1.6), world, length, undefined, boomBlocks);
      expect(near).toBeCloseTo(open, 1); expect(Math.abs(near - open)).toBeLessThanOrEqual(.05);
      // Before the fix (any fixed collider) the boom is cut when it points at the wall.
      const old = boom(s, wallAt(1.6), world, length, undefined, c => c.parent()?.isFixed() ?? true);
      expect(old).toBeLessThan(length - .5);
    });
  }
  it('still stops at a real city solid', () => {
    const s = new Sim({ x: 0, y: 40, z: 60 }, { city: true }); sims.push(s);
    // Look for any building face along +x from the arrival terrace and check the boom shortens against it.
    const cast = (x: number) => boom(s, { x, y: 25, z: 60.7 }, new Vector3(1, 0, 0), 30, undefined, boomBlocks);
    const xs = [60, 80, 100, 120, 130, 135, 140, 145], lengths = xs.map(cast);
    expect(Math.min(...lengths)).toBeLessThan(30);
  });
});
