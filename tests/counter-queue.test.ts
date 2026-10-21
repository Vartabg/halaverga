import { beforeEach, describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { COMMAND, requestCommand } from '../src/game/commands';
import { BATTLE, battle, resetBattle } from '../src/game/celestialBattle';
import { banish, resetBanish, stepBanish } from '../src/game/banish';
import { MODE } from '../src/game/banishState';
import { flowPaths } from '../src/game/combatFlow';
import { beginStrike, cancelStrike, strike } from '../src/game/strike';
import { counterState } from '../src/game/counterState';
import { resetCounter, settleCounter, tryCounter, updateCounterWindow } from '../src/game/counter';
import { resetBulletTime, stepBulletTime } from '../src/game/bulletTime';

// Codex review 2026-10-21 (e876b59): a counter pressed while another strike is under way is queued by chain combat. It must be
// credited (count, slow motion, broken charge) only when that dive really launches at the attacker; a dropped queue credits
// nothing. Two demons 30 m ahead of the angel, demon 1 charging; the frame order is Shooter's: window, press, stepBanish, settle.
const player = { x: 0, y: 30, z: 0 };
function setup(close = false) {
  const s = createShooter(); createDroneSim(s); s.drones.count = 2;
  for (let i = 0; i < 2; i++) { Object.assign(s.drones.pos[i], { x: i ? 15 : -15, y: 30, z: -30 }); s.drones.phase[i] = PHASE.patrol; }
  if (close) Object.assign(s.drones.pos[1], { x: 0, y: 30, z: -2 }); // inside STRIKE.contact: the dive lands the step it launches
  buildTargets(s); for (const t of s.targets) t.los = true;
  flowPaths.fill(1); resetBattle(0); resetBanish(banish, s); resetBulletTime(); resetCounter(); cancelStrike();
  counterState.serial = 0; counterState.deflects = 0;
  battle.charging = 1; battle.charge = BATTLE.windup * .5;
  return s;
}
function frame(s: ReturnType<typeof setup>) { stepBanish(banish, s, player, 1 / 60); return settleCounter(s, player); }
const press = (s: ReturnType<typeof setup>, kind: number = COMMAND.context, target = -1) => {
  updateCounterWindow(s, player, 1 / 60); requestCommand(s, kind, target); return tryCounter(s, player);
};

describe('a queued counter is credited only when its dive launches', () => {
  beforeEach(() => resetBulletTime());
  it('the strike before it is cancelled (its target hid): the queue drops and nothing is credited, ever', () => {
    const s = setup(); beginStrike(0, s.drones.pos[0], 34); s.targets[0].los = false;
    expect(press(s)).toBe('pending'); expect(counterState.serial).toBe(0);
    expect(frame(s)).toBe('dropped');
    expect(strike.phase).toBe(0); expect(strike.queued).toBe(false);
    for (let i = 0; i < 60; i++) expect(frame(s)).toBe('');
    expect(counterState.serial).toBe(0); expect(battle.charging).toBe(1); expect(stepBulletTime(1 / 60, false, false)).toBe(1);
  });
  for (const phase of ['active', 'freeze', 'early carry'] as const) {
    it(`held in the queue during the ${phase} strike, it is credited the frame the dive at the attacker launches`, () => {
      const s = setup(); beginStrike(0, s.drones.pos[0], 34);
      if (phase !== 'active') { strike.phase = 2; strike.freeze = phase === 'freeze' ? .045 : 0; strike.t = phase === 'early carry' ? .02 : 0; }
      expect(press(s)).toBe('pending');
      expect(frame(s)).toBe(''); // still queued: no credit, no slow motion, the charge still building
      expect(strike.queued).toBe(true); expect(strike.queueTarget).toBe(1);
      expect(counterState.serial).toBe(0); expect(counterState.scale).toBe(1); expect(battle.charging).toBe(1);
      strike.phase = 2; strike.freeze = 0; strike.t = .1; // the earlier strike finishes its carry
      expect(frame(s)).toBe('counter');
      expect(strike.phase).toBe(1); expect(strike.target).toBe(1);
      expect(counterState.serial).toBe(1); expect(battle.charging).toBe(-1); expect(stepBulletTime(.1, false, false)).toBeLessThan(1);
    });
    it(`held in the queue during the ${phase} strike, an attacker bound before the handoff is never credited`, () => {
      const s = setup(); beginStrike(0, s.drones.pos[0], 34);
      if (phase !== 'active') { strike.phase = 2; strike.freeze = phase === 'freeze' ? .045 : 0; strike.t = phase === 'early carry' ? .02 : 0; }
      expect(press(s)).toBe('pending'); frame(s);
      banish.mode[0] = banish.mode[1] = MODE.bound; strike.phase = 2; strike.freeze = 0; strike.t = .1;
      expect(frame(s)).toBe('dropped');
      expect(strike.target).not.toBe(1); expect(counterState.serial).toBe(0);
    });
  }
  it('with no strike under way the dive launches the same frame and the counter is credited at once', () => {
    const s = setup();
    expect(press(s)).toBe('pending'); expect(frame(s)).toBe('counter');
    expect(strike.target).toBe(1); expect(counterState.serial).toBe(1);
  });
  it('a close attacker struck in the same step it is countered is credited exactly once (Codex 2026-10-21, 3e62dd5)', () => {
    const s = setup(true);
    expect(press(s)).toBe('pending');
    expect(frame(s)).toBe('counter');
    expect(strike.phase).toBe(2); expect(strike.landed).toBe(true); expect(strike.target).toBe(1);
    expect(banish.mode[1]).toBe(MODE.bound); expect(s.stats.hits).toBeGreaterThan(0);
    expect(counterState.serial).toBe(1); expect(battle.charging).toBe(-1); expect(banish.rebukeT).toBe(banish.clock);
    expect(stepBulletTime(.1, false, false)).toBeLessThan(1);
    for (let i = 0; i < 30; i++) expect(frame(s)).toBe('');
    expect(counterState.serial).toBe(1);
  });
  it('a dropped counter that had quenched a dart stands as a deflection', () => {
    const s = setup(); battle.charging = -1; beginStrike(0, s.drones.pos[0], 34); s.targets[0].los = false;
    const bolt = battle.bolts[0]; bolt.live = true; bolt.src = 1;
    Object.assign(bolt.p, player, { z: player.z - 5 }); Object.assign(bolt.v, { x: 0, y: 0, z: BATTLE.speed });
    expect(press(s)).toBe('pending'); expect(bolt.live).toBe(false);
    expect(frame(s)).toBe('dropped'); expect(counterState.deflects).toBe(1); expect(counterState.serial).toBe(0);
  });
});
describe('a flick keeps its cast meaning', () => {
  beforeEach(() => resetBulletTime());
  it('a flick aimed at a bound demon casts it and does not counter', () => {
    const s = setup(); banish.mode[0] = MODE.bound; banish.timer[0] = 1;
    expect(press(s, COMMAND.flick, 0)).toBe('');
    expect(s.input.cmdKind).toBe(COMMAND.flick); expect(s.input.cmdTarget).toBe(0);
    frame(s);
    expect(banish.mode[0]).toBe(MODE.cast); expect(strike.target).not.toBe(1); expect(counterState.serial).toBe(0);
    expect(counterState.open).toBe(true); // the window stays open for a strike press
  });
  it('a flick at a free demon is a strike and counters the attacker', () => {
    const s = setup();
    expect(press(s, COMMAND.flick, 0)).toBe('pending'); expect(s.input.cmdTarget).toBe(1);
    expect(frame(s)).toBe('counter'); expect(strike.target).toBe(1);
  });
});
