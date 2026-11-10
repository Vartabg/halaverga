import { afterAll, beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { mountPhysicsGeometry, physicsGeometry } from './physicsWorld';
import { PATROLS, patrolPosition } from '../src/game/dronePatrols';
import { heightAt } from '../src/world/massifData';
// The fight is flown in the open air over the Hermon gorge. These checks use the production collision triangles.
let world: RAPIER.World;
beforeAll(async () => { await RAPIER.init(); world = new RAPIER.World({ x: 0, y: 0, z: 0 }); mountPhysicsGeometry(world, physicsGeometry(false)); world.step(); });
afterAll(() => world?.free());
it('leaves the air over the gorge open for the whole length of the fight', () => {
  const ball = new RAPIER.Ball(2), q = { x: 0, y: 0, z: 0, w: 1 };
  // West of the summit shoulder the lane is open end to end; east of centre it is open except where the shoulder stands (z -15 to -70).
  for (const x of [-20, -10, 0, 6]) for (const y of [25, 35, 45]) for (let z = 40; z >= -125; z -= 5)
    expect(world.intersectionWithShape({ x, y, z }, q, ball), `air at ${x},${y},${z}`).toBeNull();
  for (const y of [25, 35, 45]) for (const z of [40, 20, 0, -80, -100, -120])
    expect(world.intersectionWithShape({ x: 15, y, z }, q, ball), `air at 15,${y},${z}`).toBeNull();
});
it('keeps every patrol visible from the approach and from the middle of the gorge', () => {
  const target = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 0 };
  for (const from of [{ x: 0, y: 25, z: 50 }, { x: -20, y: 35, z: 10 }, { x: 0, y: 45, z: -55 }])
    for (const patrol of PATROLS) for (let n = 0; n < 12; n++) {
      patrolPosition(patrol, n / 12 * Math.PI * 2 / patrol.omega, target);
      const d = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
      dir.x = (target.x - from.x) / d; dir.y = (target.y - from.y) / d; dir.z = (target.z - from.z) / d;
      expect(world.castRay(new RAPIER.Ray(from, dir), Math.max(0, d - 1), true), `${patrol.id} from ${JSON.stringify(from)}`).toBeNull();
    }
});
it('keeps every patrol loop well above the mountain', () => {
  const at = { x: 0, y: 0, z: 0 };
  for (const patrol of PATROLS) for (let n = 0; n < 360; n++) {
    patrolPosition(patrol, n / 360 * Math.PI * 2 / patrol.omega, at);
    expect(at.y - heightAt(at.x, at.z), `${patrol.id} over the ground`).toBeGreaterThanOrEqual(6);
  }
});
it('gives the summit shoulder as real cover: rock stands between the east rim and the gorge floor', () => {
  const from = { x: 60, y: 45, z: -45 }, to = { x: 0, y: 5, z: -45 }, d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  expect(world.castRay(new RAPIER.Ray(from, { x: (to.x - from.x) / d, y: (to.y - from.y) / d, z: (to.z - from.z) / d }), d, true)).not.toBeNull();
});
