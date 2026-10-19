import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeSanctuary } from '../src/world/sanctuaryData';
import { PATROLS, patrolPosition } from '../src/game/dronePatrols';
import { START } from '../src/game/motion';
import { createShooterWorld, shotSegmentClear } from '../src/game/shotResolve';

beforeAll(() => RAPIER.init());
describe('the authored sanctuary', () => {
  it('shares its actual visible triangles with collision, supports the spawn, and leaves enemy flight lanes clear', () => {
    const built = makeSanctuary(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      expect(built.geometry.groups).toHaveLength(3);
      expect(built.indices.length / 3).toBeLessThan(60000);
      world.createCollider(RAPIER.ColliderDesc.trimesh(built.vertices, built.indices)); world.step();
      const hit = world.castRay(new RAPIER.Ray(START, { x: 0, y: -1, z: 0 }), 2, true);
      expect(hit?.timeOfImpact).toBeCloseTo(1.06, 3);
      // A bolt advances < .5 m in a frame. Unlike aim LOS, it must still hit the launch dais at y=20.
      const ray = createShooterWorld(world, RAPIER), above = { x: 0, y: 20.2, z: 65 }, below = { x: 0, y: 19.9, z: 65 };
      expect(ray.lineClear(above, below)).toBe(true);
      expect(shotSegmentClear(ray, above, below)).toBe(false);
      const at = { x: 0, y: 0, z: 0 }, rotation = { x: 0, y: 0, z: 0, w: 1 }, sphere = new RAPIER.Ball(1.3);
      for (const patrol of PATROLS) for (let i = 0; i < 48; i++) {
        patrolPosition(patrol, i / 48 * Math.PI * 2 / patrol.omega, at);
        expect(world.intersectionWithShape(at, rotation, sphere), `${patrol.id}: ${JSON.stringify(at)}`).toBeNull();
      }
    } finally { world.free(); built.geometry.dispose(); }
  });
});
