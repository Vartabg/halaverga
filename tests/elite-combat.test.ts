import { expect, it } from 'vitest';
import { createShooter, PHASE } from '../src/game/combat';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { createBanish, resetBanish, stepBanish, MODE, FX } from '../src/game/banish';
import { requestCommand, COMMAND } from '../src/game/commands';
import { battle, resetBattle } from '../src/game/celestialBattle';
import { ELITE, castDuration } from '../src/game/encounter';
import { restingHeight } from '../src/game/wardenElevation';
import { BANISH } from '../src/game/banishState';
import { cancelStrike, strike, strikeVelocity } from '../src/game/strike';
import { flowTarget } from '../src/game/combatFlow';
import { WA } from '../src/game/banishState';
function setup(i = 5) {
  const s = createShooter(); createDroneSim(s); buildTargets(s); const b = createBanish(); resetBanish(b, s); resetBattle();
  battle.clock = 1;
  for (const t of s.targets) { t.alive = false; t.los = true; }
  Object.assign(s.drones.pos[i], { x: 0, y: 40, z: 0 }); Object.assign(s.targets[i].c, s.drones.pos[i]);
  s.targets[i].alive = true; s.drones.phase[i] = PHASE.alert; s.aim.valid = true;
  const near = { x: 0, y: 40, z: 10 };
  const tick = (seconds: number, at = near) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) { battle.clock += 1 / 60; stepBanish(b, s, at, 1 / 60); } };
  const contact = () => { cancelStrike(); requestCommand(s, COMMAND.sword, i); stepBanish(b, s, near, 1 / 60);
    expect([1, 2]).toContain(strike.phase);
    if (strike.phase === 1) { strikeVelocity({ x: 0, y: 0, z: -40 }, near, Math.max(.05, strike.minTime + .01), false); stepBanish(b, s, s.targets[i].c, 1 / 60); }
    expect(strike.landed).toBe(true); };
  return { s, b, near, tick, contact, i };
}
it('gives a warden two armor exchanges, a visible retaliation, then the longer bind/cast finish', () => {
  const { s, b, i, near, tick, contact } = setup();
  contact(); expect(b.armor[i]).toBe(1); expect(b.mode[i]).toBe(MODE.staggered); expect(s.stats.kills).toBe(0);
  expect(s.drones.held[i]).toBe(1); expect(strike.dir.z).toBeGreaterThan(0); expect(strike.carrySpeed).toBe(24); expect(b.fx.some(e => e.kind === FX.armor)).toBe(true);
  tick(.5); expect(s.drones.held[i]).toBe(1); expect(b.wardens.phase[i]).toBe(WA.tell); expect(battle.charging).toBe(-1);
  requestCommand(s, COMMAND.rebuke, i); stepBanish(b, s, near, 1 / 60);
  contact(); expect(b.armor[i]).toBe(1); expect(s.drones.broken[i]).toBe(0); expect(b.cue).toBe('guarded');
  b.mode[i] = MODE.free; b.guardTime[i] = 0; b.retaliate[i] = 0;
  b.wardens.phase[i] = WA.recover; b.wardens.time[i] = 0; b.wardens.open[i] = 2; // Actual defense is covered in warden-counter.test.
  contact(); expect(b.armor[i]).toBe(0); expect(b.mode[i]).toBe(MODE.bound);
  tick(ELITE.bind + .1); expect(b.mode[i]).toBe(MODE.cast);
  tick(1.2); expect(s.stats.kills).toBe(0);
  // Cast down to the ground below it (here the gorge water), where the blow is seen: not somewhere beneath the world.
  tick(castDuration(i)); expect(s.stats.kills).toBe(1); expect(s.drones.pos[i].y).toBeCloseTo(restingHeight(0, 0, 0) + BANISH.castRest, 3);
  expect(s.drones.phase[i]).toBe(PHASE.dying); expect(b.armor[i]).toBe(2);
});
it('does not let queued or repeated strikes bypass an armor response; other targets remain available', () => {
  const { s, b, i, near, contact } = setup(); contact(); cancelStrike();
  for (let n = 0; n < 10; n++) { requestCommand(s, COMMAND.sword, i); stepBanish(b, s, near, 1 / 60); }
  expect(strike.phase).toBe(0); expect(b.armor[i]).toBe(1); expect(b.cue).toBe('guarded'); expect(flowTarget(b, s, near)).toBe(-1);
  s.targets[0].alive = true; Object.assign(s.targets[0].c, { x: 0, y: 40, z: -10 });
  expect(flowTarget(b, s, near)).toBe(0);
});
it('does not turn retaliation into hidden damage or an attack from outside the encounter range', () => {
  const { s, b, i, tick, contact } = setup(); contact(); tick(1, { x: 200, y: 40, z: 0 });
  expect(battle.charging).toBe(-1); expect(battle.ward).toBe(3); expect(b.retaliate[i]).toBe(0); expect(s.drones.held[i]).toBe(0);
});
it('keeps lesser demons quick and lets an in-progress banishment finish after Brake cancels the strike', () => {
  const { s, b, i, tick, contact } = setup(0); contact(); contact(); expect(b.mode[i]).toBe(MODE.staggered); contact(); expect(b.mode[i]).toBe(MODE.cast);
  cancelStrike(); tick(2.2); expect(s.stats.kills).toBe(1); expect(s.drones.held[i]).toBe(0);
});
it('regroup clears guard/reaction work and restores both wardens without changing the lesser loop', () => {
  const { s, b, i, contact } = setup(); contact(); resetBanish(b, s);
  expect(b.armor[i]).toBe(2); expect(b.armor[7]).toBe(2); expect(b.armor[0]).toBe(0);
  expect(b.guardTime.every(t => t === 0)).toBe(true); expect(b.retaliate.every(t => t === 0)).toBe(true); expect(s.drones.held.every(t => t === 0)).toBe(true);
});

it('lets a rebuke interrupt the warden response without requiring a drawn ritual', () => {
  const { s, b, i, near, contact } = setup(); contact(); requestCommand(s, COMMAND.rebuke, i); stepBanish(b, s, near, 1 / 60);
  expect(b.guardTime[i]).toBe(0); expect(b.retaliate[i]).toBe(0); expect(s.drones.held[i]).toBe(0); expect(battle.charging).toBe(-1);
});
