import { expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA } from '../src/game/banishState';
import { strike, cancelStrike, strikeVelocity } from '../src/game/strike';
import { momentumVelocity } from '../src/game/momentumFlight';
import { clearOfGround, GROUND_CLEARANCE, restingHeight, wardenElevation } from '../src/game/wardenElevation';
import { WATER_LEVEL } from '../src/game/combat';
import { WORLD } from '../src/game/motion';
import { heightAt } from '../src/world/massifData';
it('makes the last armor layer require a defended opening rather than repeated contacts', () => {
  const { b, w, i, contact, tick } = wardenSetup(); w.cool[i] = 10; contact(); expect(b.armor[i]).toBe(1);
  tick(2); w.phase[i] = WA.idle; w.cool[i] = 10; b.guardTime[i] = 0; contact(); expect(b.armor[i]).toBe(1);
  w.phase[i] = WA.recover; w.open[i] = 2; b.guardTime[i] = 0; contact();
  expect(w.counters).toBe(1); expect(b.armor[i]).toBe(0); expect(b.mode[i]).toBe(3);
});
it('reserves the stronger contact beat for an actual elite contact and respects reduced motion', () => {
  const { contact, w, i } = wardenSetup(); w.cool[i] = 10; contact(); expect(strike.freeze).toBeCloseTo(.11);
  const v = { x: 0, y: 0, z: -40 }; strikeVelocity(v, { x: 0, y: 35, z: 2 }, 1 / 60, false);
  expect(Math.hypot(v.x, v.y, v.z)).toBe(0);
  strikeVelocity(v, { x: 0, y: 35, z: 2 }, 1 / 60, true); expect(Math.hypot(v.x, v.y, v.z)).toBeGreaterThan(0); cancelStrike();
});
it('stops a high-speed dive when released instead of requiring forward movement to aim', () => {
  let velocity = { x: 0, y: -45, z: -40 };
  for (let i = 0; i < 60; i++) velocity = momentumVelocity(velocity, { forward: 0, strafe: 0, vertical: 0 }, 0, -.7, true, false, 1 / 60);
  expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBe(0);
  expect(wardenElevation(7, 1, 40)).toBeGreaterThan(wardenElevation(7, 2, 40));
});
it('never sends a warden into the mountain: a goal over a ridge is lifted clear of the rock', () => {
  // The summit shoulder east of the gorge stands above both wardens' lowest bands.
  const x = 30, z = -40, ground = heightAt(x, z);
  expect(ground).toBeGreaterThan(wardenElevation(5, 0, 20));
  expect(clearOfGround(x, wardenElevation(5, 0, 20), z)).toBeCloseTo(ground + GROUND_CLEARANCE, 6);
  expect(clearOfGround(0, 40, 0)).toBe(40); // open air over the gorge is untouched
});
it('stops the lift at the ceiling margin and rests the victory ring on the ground, never under the gorge water', () => {
  expect(clearOfGround(0, 400, 0)).toBe(400 > WORLD.ceiling - 10 ? WORLD.ceiling - 10 : 400);
  expect(heightAt(0, -60)).toBeLessThan(WATER_LEVEL); // the gorge floor is flooded
  expect(restingHeight(0, -60, 11.2)).toBeGreaterThanOrEqual(WATER_LEVEL);
  // On the summit shoulder the ring sits on the highest ground under it, so no part of it is buried.
  const x = 14, z = -45, top = restingHeight(x, z, 11.2);
  for (let k = 0; k < 8; k++) expect(top).toBeGreaterThanOrEqual(heightAt(x + Math.cos(k * Math.PI / 4) * 11.2, z + Math.sin(k * Math.PI / 4) * 11.2));
});
