import { afterEach, expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA, WARDEN } from '../src/game/banishState';
import { battle } from '../src/game/celestialBattle';
import { wardenWorld, wardenSegment } from '../src/game/wardenMath';
import RAPIER from '@dimforge/rapier3d-compat';
import { createShooterWorld } from '../src/game/shotResolve';
afterEach(() => { wardenWorld.clear = () => true; });
it('tests the whole short projectile segment against real Rapier stone, compensating for the aiming query endpoint', async () => {
  await RAPIER.init(); const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 5, .05).setTranslation(0, 35, 10)); world.step();
    wardenWorld.clear = createShooterWorld(world, RAPIER).lineClear;
    const a = { x: 0, y: 35, z: 9.8 }, b = { x: 0, y: 35, z: 10.2 };
    expect(wardenWorld.clear(a, b)).toBe(true); expect(wardenSegment(a, b)).toBe(false);
  } finally { world.free(); }
});
it('shows a full tell, locks the lane before launch and misses an angel that moves aside', () => {
  const { w, i, player, step, tick } = wardenSetup(); step(); expect(w.phase[i]).toBe(WA.tell);
  tick(WARDEN.lock + .03); const lane = { ...w.aim[i] }; player.x = 10;
  tick(WARDEN.rushTell); expect(w.aim[i]).toEqual(lane); tick(1);
  expect(w.phase[i]).toBe(WA.recover); expect(w.open[i]).toBeGreaterThan(0); expect(battle.ward).toBe(3);
});
it.each([1 / 30, 1 / 60, 1 / 120])('sweeps a committed rush at dt%s; a held shield cannot block it and it hits once', dt => {
  const { s, w, i, step, tick } = wardenSetup(); s.input.shield = 1; step(dt); tick(2.4, dt);
  expect(w.phase[i]).toBe(WA.recover); expect(battle.ward).toBe(2); expect(w.open[i]).toBe(0);
  tick(.2, dt); expect(battle.ward).toBe(2);
});
it('stops the rush at new cover instead of moving a body or dealing a hit through stone', () => {
  const { s, w, i, step, tick } = wardenSetup(); step(); tick(WARDEN.rushTell + .01);
  wardenWorld.clear = (a, b) => !(a.z < 5 && b.z >= 5); tick(1);
  expect(s.drones.pos[i].z).toBeLessThan(5); expect(w.phase[i]).toBe(WA.recover); expect(battle.ward).toBe(3);
});
