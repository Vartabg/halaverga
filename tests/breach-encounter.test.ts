import { expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA } from '../src/game/banishState';
import { strike, cancelStrike, strikeVelocity } from '../src/game/strike';
import { momentumVelocity } from '../src/game/momentumFlight';
import { wardenElevation } from '../src/game/breachRoutes';
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
