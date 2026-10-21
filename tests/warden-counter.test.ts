import { expect, it } from 'vitest';
import { wardenSetup } from './warden-support';
import { WA, WARDEN } from '../src/game/banishState';
import { MODE, resetBanish } from '../src/game/banish';
import { requestCommand, COMMAND } from '../src/game/commands';
import { cancelStrike, strike } from '../src/game/strike';
import { flowTarget, flowVisible, updateFlowPaths } from '../src/game/combatFlow';
import { flightFeel } from '../src/game/flightFeel';
it('two defended attacks and actual counters break one layer each, then bind and banish the lancer', () => {
  const { b, w, i, player, step, tick, contact, s } = wardenSetup(); step(); tick(WARDEN.lock + .03); player.x = 12;
  tick(1.6); expect(w.phase[i]).toBe(WA.recover); expect(w.open[i]).toBeGreaterThan(0); expect(b.armor[i]).toBe(2);
  contact(); expect(w.counters).toBe(1); expect(b.armor[i]).toBe(1); expect(b.mode[i]).toBe(MODE.staggered); expect(s.stats.kills).toBe(0);
  s.input.shield = 1; tick(.6); expect(w.move[i]).toBe(WA.sweep);
  for (let n = 0; n < 180 && w.phase[i] !== WA.recover; n++) step();
  expect(w.open[i]).toBeGreaterThan(0); flightFeel.brake = true; contact(); expect(flightFeel.brake).toBe(false);
  expect(w.counters).toBe(2); expect(b.armor[i]).toBe(0); expect(b.mode[i]).toBe(MODE.bound);
  tick(3.5); expect(s.stats.kills).toBe(1); expect(w.counters).toBe(2);
});
it('a launched punish retains its earned opening through travel, but cancelling it removes the reservation', () => {
  const { b, w, i, player, s, step } = wardenSetup();
  b.armor[i] = 1;
  w.phase[i] = WA.recover; w.active = i; w.open[i] = .01;
  requestCommand(s, COMMAND.sword, i); step(); expect(strike.phase).toBe(1); expect(w.pending).toBe(i);
  w.open[i] = 0; step(); expect(w.pending).toBe(i);
  Object.assign(player, s.drones.pos[i]); step(); expect(w.counters).toBe(1); expect(b.mode[i]).toBe(MODE.bound);
  const c = wardenSetup(); c.w.phase[i] = WA.recover; c.w.open[i] = .01;
  requestCommand(c.s, COMMAND.sword, i); c.step(); cancelStrike(); c.step(); expect(c.w.pending).toBe(-1); expect(c.w.counters).toBe(0);
});
it('a hit rush gives no special punish and waiting out a recovery cannot stockpile a counter', () => {
  const a = wardenSetup(); a.step(); a.tick(2.2); a.contact(); expect(a.w.counters).toBe(0); expect(a.b.armor[a.i]).toBe(1);
  const b = wardenSetup(); b.step(); b.tick(WARDEN.lock + .03); b.player.x = 10; b.tick(5); b.contact();
  expect(b.w.counters).toBe(0); expect(b.b.armor[b.i]).toBe(1);
});
it('spam cannot strike through a tell; rebuke interrupts the attack and reset clears every pending threat', () => {
  const { b, w, i, s, step } = wardenSetup(); step();
  for (let n = 0; n < 8; n++) { requestCommand(s, COMMAND.sword, i); step(); }
  expect(b.armor[i]).toBe(2); expect(strike.phase).toBe(0); expect(w.counters).toBe(0);
  requestCommand(s, COMMAND.rebuke); step(); expect(w.phase[i]).toBe(WA.idle); expect(s.drones.held[i]).toBe(0);
  w.pending = i; w.bolts[0].live = true; w.open[i] = 2; resetBanish(b, s);
  expect(w.pending).toBe(-1); expect(w.bolts.some(o => o.live)).toBe(false); expect(w.open[i]).toBe(0); expect(w.counters).toBe(0);
});
it('the regular Strike button favors the earned visible counter over another lesser target, without selecting through walls', () => {
  const { b, w, s, i, player } = wardenSetup(); w.phase[i] = WA.recover; w.open[i] = 2;
  s.targets[0].alive = true; s.targets[0].los = true; Object.assign(s.targets[0].c, { x: 0, y: 35, z: 15 }); s.drones.hp[0] = 6; s.drones.phase[0] = 1;
  expect(flowTarget(b, s, player)).toBe(i); s.targets[i].los = false; expect(flowTarget(b, s, player)).toBe(0);
  s.targets[i].los = true; flowVisible[i] = 0; expect(flowTarget(b, s, player)).toBe(0);
  s.aim.origin.z = 32; s.targets[i].c.z = 22; // Past the angel, but still in front of the chase camera.
  updateFlowPaths(s, player, () => true, { width: 393, height: 852 });
  expect(flowVisible[i]).toBe(1); expect(flowTarget(b, s, player)).toBe(i);
});
