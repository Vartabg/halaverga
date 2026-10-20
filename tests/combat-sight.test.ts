import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { clearCombatSight } from '../src/game/combatSight';
import { createShooterWorld } from '../src/game/shotResolve';
beforeAll(async () => { await RAPIER.init(); });
it('shortens a clear boom when a pillar cuts the shoulder-to-demon sightline', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.6, 2, 3));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.25, .8, .25), body); world.step();
    const query = createShooterWorld(world, RAPIER), head = { x: 0, y: 2, z: 0 }, boom = { x: 2, y: 0, z: 6 }, target = { x: 0, y: 2, z: -10 };
    const camera = () => ({ x: head.x + boom.x, y: head.y + boom.y, z: head.z + boom.z });
    expect(query.lineClear(head, camera())).toBe(true); expect(query.lineClear(camera(), target)).toBe(false);
    clearCombatSight(world, new RAPIER.Ray(head, { x: 0, y: 0, z: -1 }), head, boom, target);
    expect(query.lineClear(camera(), target)).toBe(true); expect(Math.hypot(boom.x, boom.y, boom.z)).toBeLessThan(6);
    expect(boom.x / boom.z).toBeCloseTo(1 / 3); // no lateral teleport through the pillar.
  } finally { world.free(); }
});
it('leaves a clear view unchanged', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const head = { x: 0, y: 2, z: 0 }, boom = { x: 2, y: 0, z: 6 };
    clearCombatSight(world, new RAPIER.Ray(head, { x: 0, y: 0, z: -1 }), head, boom, { x: 0, y: 2, z: -10 });
    expect(boom).toEqual({ x: 2, y: 0, z: 6 });
  } finally { world.free(); }
});
