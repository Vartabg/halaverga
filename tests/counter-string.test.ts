import { describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { COMMAND, requestCommand } from '../src/game/commands';
import { BATTLE, battle, resetBattle } from '../src/game/celestialBattle';
import { banish, resetBanish, stepBanish } from '../src/game/banish';
import { MODE, WA } from '../src/game/banishState';
import { flowPaths, flowVisible } from '../src/game/combatFlow';
import { beginStrike, cancelStrike, holdStrike, strike } from '../src/game/strike';
import { counterState } from '../src/game/counterState';
import { resetCounter, settleCounter, tryCounter, updateCounterWindow } from '../src/game/counter';
import { resetSlowMotion } from '../src/game/slowMotion';
import { LAST, STRING } from '../src/game/swordString';

// Counters meeting the three-cut string (docs/plans/2026-11-16-hermon-counters.md, D2). The angel looks down -z. Demon 0 is dead
// ahead (the demon being cut), demon 1 is off to the right (the attacker), demon 5 is a warden, parked out of reach unless a test
// brings it in. The frame order is Shooter's: window, press, stepBanish, settle.
const player = { x: 0, y: 30, z: 0 }, FAR = { x: 400, y: 30, z: 400 };
function setup() {
  const s = createShooter(); createDroneSim(s); s.drones.count = 6;
  for (let i = 0; i < 6; i++) { Object.assign(s.drones.pos[i], FAR, { x: FAR.x + 20 * i }); s.drones.phase[i] = PHASE.patrol; }
  Object.assign(s.drones.pos[0], { x: 0, y: 30, z: -20 }); Object.assign(s.drones.pos[1], { x: 15, y: 30, z: -30 });
  const a = s.aim; a.valid = true; Object.assign(a.origin, player); Object.assign(a.dir, { x: 0, y: 0, z: -1 });
  place(s); flowPaths.fill(1); flowVisible.fill(1);
  resetBattle(); resetBanish(banish, s); resetSlowMotion(); resetCounter(); cancelStrike();
  counterState.serial = 0; counterState.deflects = 0;
  return s;
}
function place(s: ReturnType<typeof createShooter>) { buildTargets(s); for (const t of s.targets) t.los = true; }
/** Demon i as the string leaves it after `wounds` cuts. open: whether the string's window is still open on it. */
function wound(s: ReturnType<typeof setup>, i: number, wounds: number, open = true) {
  banish.wounds[i] = wounds; banish.mode[i] = MODE.staggered; banish.timer[i] = STRING.recover; s.drones.held[i] = 1;
  banish.string.target = open ? i : -1; banish.string.until = banish.clock + (open ? STRING.window : -1);
}
const charge = (i: number) => { battle.charging = i; battle.charge = BATTLE.windup * .5; };
/** A dart thrown by demon `src`, 5 m out and closing on the angel. */
function dart(src: number) {
  const o = battle.bolts[0]; o.live = true; o.src = src;
  Object.assign(o.p, player, { z: player.z - 5 }); Object.assign(o.v, { x: 0, y: 0, z: BATTLE.speed });
  return o;
}
const press = (s: ReturnType<typeof setup>, target = -1) => {
  updateCounterWindow(s, player, 1 / 60); requestCommand(s, COMMAND.context, target); return tryCounter(s, player);
};
const frame = (s: ReturnType<typeof setup>) => { stepBanish(banish, s, player, 1 / 60); return settleCounter(s, player); };

describe('a counter never takes a finishing blow away', () => {
  it('one cut from the casting blow, the press finishes the string and the prompt promises nothing', () => {
    const s = setup(); wound(s, 0, LAST); charge(1);
    updateCounterWindow(s, player, 1 / 60);
    expect(counterState.source).toBe(1); expect(counterState.attacker).toBe(-1); expect(counterState.open).toBe(false);
    expect(press(s)).toBe(''); expect(s.input.cmdTarget).toBe(-1);
    expect(frame(s)).toBe(''); expect(strike.target).toBe(0); expect(counterState.serial).toBe(0); expect(battle.charging).toBe(1);
  });
  it('the same press still quenches a dart in flight, as a deflection', () => {
    const s = setup(); wound(s, 0, LAST); const o = dart(1);
    expect(press(s)).toBe('deflect'); expect(o.live).toBe(false); expect(counterState.deflects).toBe(1);
    expect(frame(s)).toBe(''); expect(strike.target).toBe(0); expect(counterState.serial).toBe(0);
  });
  it('holds after the string window has closed, while the demon still carries both wounds', () => {
    const s = setup(); wound(s, 0, LAST, false); charge(1);
    expect(press(s)).toBe(''); expect(frame(s)).toBe(''); expect(strike.target).toBe(0);
  });
  it('earlier in the string the press is a counter: the angel leaves for the attacker', () => {
    const s = setup(); wound(s, 0, 1); charge(1);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(1);
    expect(press(s)).toBe('pending'); expect(s.input.cmdTarget).toBe(1);
    expect(frame(s)).toBe('counter'); expect(strike.target).toBe(1); expect(banish.wounds[0]).toBe(1);
  });
  it('a tap on the attacker itself counters even then', () => {
    const s = setup(); wound(s, 0, LAST); charge(1);
    expect(press(s, 1)).toBe('pending'); expect(frame(s)).toBe('counter'); expect(strike.target).toBe(1);
  });
  it('when the demon being cut is the one whose dart is closing, the press is the counter', () => {
    const s = setup(); wound(s, 0, LAST); dart(0);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(0);
    expect(press(s)).toBe('pending'); expect(frame(s)).toBe('counter'); expect(strike.target).toBe(0);
  });
});

describe('a counter and the wardens', () => {
  const ahead = (s: ReturnType<typeof setup>) => { Object.assign(s.drones.pos[0], FAR); Object.assign(s.drones.pos[5], { x: 0, y: 30, z: -25 }); place(s); charge(1); };
  it('a warden that is merely ahead is an ordinary target: the counter comes first', () => {
    const s = setup(); ahead(s);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(1);
    expect(press(s)).toBe('pending'); expect(frame(s)).toBe('counter'); expect(strike.target).toBe(1);
  });
  it('a warden left open by a dodge or a parry keeps the press, and the prompt promises nothing', () => {
    const s = setup(); ahead(s); banish.wardens.phase[5] = WA.recover; banish.wardens.open[5] = .5;
    updateCounterWindow(s, player, 1 / 60);
    expect(counterState.source).toBe(1); expect(counterState.attacker).toBe(-1);
    expect(press(s)).toBe(''); expect(s.input.cmdTarget).toBe(-1); expect(counterState.serial).toBe(0);
  });
  it('a warden with its armour broken keeps its finishing blow', () => {
    const s = setup(); ahead(s); banish.armor[5] = 0;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(-1);
    expect(press(s)).toBe(''); expect(s.input.cmdTarget).toBe(-1);
  });
});

describe('credit follows the strike the press began', () => {
  it('a hold left over from an earlier cut on the attacker is not a counter', () => {
    const s = setup(); dart(1);
    beginStrike(1, s.drones.pos[1], 30); holdStrike(0, STRING.window, 0, 0, 0); strike.t = .2; // on demon 1, between cuts
    banish.guardTime[1] = 1; // the retargeted press is refused (guarded), so no new strike begins
    const serial = strike.serial;
    expect(press(s)).toBe('pending');
    expect(frame(s)).toBe('dropped'); expect(strike.serial).toBe(serial);
    expect(counterState.serial).toBe(0); expect(counterState.deflects).toBe(1);
  });
  it('a step-in on a wounded attacker within reach is credited like a dive', () => {
    const s = setup(); Object.assign(s.drones.pos[0], FAR); Object.assign(s.drones.pos[1], { x: 0, y: 30, z: -8 }); place(s);
    wound(s, 1, 1, false); dart(1);
    expect(press(s)).toBe('pending');
    expect(frame(s)).toBe('counter'); expect(strike.lunge).toBe(true); expect(strike.target).toBe(1); expect(counterState.serial).toBe(1);
  });
});

describe('a counter answers the whole attack', () => {
  it('a dart the attacker threw while the press waited in the queue is quenched when the counter is credited', () => {
    const s = setup(); charge(1);
    beginStrike(0, s.drones.pos[0], 20); // a dive at demon 0 is under way, so the counter press is queued
    expect(press(s)).toBe('pending'); expect(frame(s)).toBe(''); expect(strike.queued).toBe(true);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(-1); // no second prompt while it is on its way
    const o = dart(1); battle.charging = -1; // the wind-up ran out and the dart is in the air
    cancelStrike(); strike.queued = true; strike.queueTarget = 1; strike.queueTime = .5; strike.t = 1; // the first dive is over
    expect(frame(s)).toBe('counter'); expect(strike.target).toBe(1); expect(o.live).toBe(false);
  });
  it('opens no window while the angel is on the ground', () => {
    const s = setup(); charge(1); dart(1);
    updateCounterWindow(s, player, 1 / 60, false);
    expect(counterState.open).toBe(false); expect(counterState.source).toBe(-1); expect(counterState.bolt).toBe(-1);
    requestCommand(s, COMMAND.context); expect(tryCounter(s, player)).toBe(''); expect(battle.bolts[0].live).toBe(true);
  });
});
