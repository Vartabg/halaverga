import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { clearCombatSight, createCombatSight } from '../src/game/combatSight';
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
    expect(query.lineClear(camera(), target)).toBe(true); expect(Math.hypot(boom.x, boom.y, boom.z)).toBeLessThan(Math.hypot(2, 6) - .02);
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
it('does not pump in and out while hovering alongside a pillar', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.6, 2, 3));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.25, .8, .25), body); world.step();
    const head = { x: 0, y: 2, z: 0 }, target = { x: 0, y: 2, z: -10 }, ray = new RAPIER.Ray(head, { x: 0, y: 0, z: -1 });
    const state = createCombatSight(), lengths: number[] = [], full = Math.hypot(2, 6);
    let length = full;
    for (let n = 0; n < 180; n++) {
      length += (full - length) * (1 - Math.exp(-12 / 60));
      const boom = { x: 2 * length / full, y: 0, z: 6 * length / full };
      clearCombatSight(world, ray, head, boom, target, state, 1 / 60);
      length = Math.hypot(boom.x, boom.z); if (n > 30) lengths.push(length);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(.08);
    expect(length).toBeGreaterThan(full * .8); // retain useful distance instead of one whole zoom step.
    world.removeRigidBody(body); world.step();
    const before = length;
    for (let n = 0; n < 60; n++) {
      const boom = { x: 2, y: 0, z: 6 };
      clearCombatSight(world, ray, head, boom, target, state, 1 / 60);
      const next = Math.hypot(boom.x, boom.z);
      expect(next - length).toBeLessThanOrEqual(8 / 60 + 1e-8); expect(next).toBeGreaterThanOrEqual(length - 1e-8); length = next;
    }
    expect(length).toBeCloseTo(full); expect(length).toBeGreaterThan(before);
  } finally { world.free(); }
});
it('rechecks the held radius when a new chain target is on the other side of stone', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(1.6, 2, 3));
    world.createCollider(RAPIER.ColliderDesc.cuboid(.25, .8, .25), body); world.step();
    const head = { x: 0, y: 2, z: 0 }, target = { x: 8, y: 2, z: 3 }, boom = { x: 2, y: 0, z: 6 };
    const query = createShooterWorld(world, RAPIER), state = { distance: Math.hypot(1, 3), hold: .1 };
    expect(query.lineClear({ x: 1, y: 2, z: 3 }, target)).toBe(false);
    expect(query.lineClear({ x: 2, y: 2, z: 6 }, target)).toBe(true);
    clearCombatSight(world, new RAPIER.Ray(head, { x: 0, y: 0, z: -1 }), head, boom, target, state, 1 / 60);
    expect(query.lineClear({ x: head.x + boom.x, y: head.y + boom.y, z: head.z + boom.z }, target)).toBe(true);
  } finally { world.free(); }
});
