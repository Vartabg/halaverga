import { beforeEach, describe, expect, it } from 'vitest';
import { createShooter } from '../src/game/combat';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { COMMAND, requestCommand } from '../src/game/commands';
import { BATTLE, battle, resetBattle } from '../src/game/celestialBattle';
import { banish, resetBanish } from '../src/game/banish';
import { BANISH, MODE } from '../src/game/banishState';
import { flowPaths } from '../src/game/combatFlow';
import { COUNTER, dartIntercept, tryCounter, updateCounterWindow } from '../src/game/counter';
import { counterState } from '../src/game/counterState';
import { BULLET, resetBulletTime, startBulletTime, stepBulletTime } from '../src/game/bulletTime';

/** The angel `gap` metres in front (+z) of demon 0, every demon seen with a clear path. */
function setup(gap = 12) {
  const s = createShooter(); createDroneSim(s); buildTargets(s);
  for (const t of s.targets) t.los = true;
  flowPaths.fill(1); resetBattle(0); resetBanish(banish, s); resetBulletTime();
  counterState.serial = 0; counterState.deflects = 0;
  const player = { ...s.drones.pos[0], z: s.drones.pos[0].z + gap };
  return { s, player };
}
/** Demon 0's dart, `ahead` seconds out on the line to the angel, flying at `toward` (1 straight at it, -1 straight away). */
function dart(player: { x: number; y: number; z: number }, ahead: number, toward = 1, sideways = 0) {
  const bolt = battle.bolts[0]; bolt.live = true; bolt.src = 0;
  bolt.p.x = player.x + sideways; bolt.p.y = player.y; bolt.p.z = player.z - BATTLE.speed * ahead;
  bolt.v.x = 0; bolt.v.y = 0; bolt.v.z = BATTLE.speed * toward;
  return bolt;
}
const charging = () => { battle.charging = 0; battle.charge = BATTLE.windup * .5; };

describe('Arkham-style counters', () => {
  beforeEach(() => resetBulletTime());
  it('opens only once a charge is under way, and a strike press then counters the attacker', () => {
    const { s, player } = setup();
    battle.charging = 0; battle.charge = BATTLE.windup * COUNTER.chargeOpen * .5;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    charging(); updateCounterWindow(s, player, 1 / 60);
    expect(counterState.open).toBe(true); expect(counterState.attacker).toBe(0);
    requestCommand(s, COMMAND.context, -1);
    expect(tryCounter(s, player)).toBe('counter');
    expect(s.input.cmdKind).toBe(COMMAND.sword); expect(s.input.cmdTarget).toBe(0);
    expect(battle.charging).toBe(-1); expect(battle.nextAttack).toBeGreaterThan(battle.clock);
    expect(banish.rebukeT).toBe(banish.clock); expect(counterState.serial).toBe(1);
  });
  it('quenches a dart about to land and dives back at the demon that threw it', () => {
    const { s, player } = setup();
    const bolt = dart(player, COUNTER.dartLead * .5);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.bolt).toBe(0); expect(counterState.attacker).toBe(0);
    const quenched = battle.quenched; requestCommand(s, COMMAND.context, -1);
    expect(tryCounter(s, player)).toBe('counter');
    expect(bolt.live).toBe(false); expect(battle.quenched).toBe(quenched + 1); expect(s.input.cmdTarget).toBe(0);
  });
  it('a dart still far out does not open the window, and no press means no counter', () => {
    const { s, player } = setup();
    dart(player, 2); updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    battle.charging = 0; battle.charge = BATTLE.windup; updateCounterWindow(s, player, 1 / 60);
    expect(tryCounter(s, player)).toBe(''); // the command was already handled: no new press
  });
  it('a receding dart, or one that will pass wide, never opens the window', () => {
    const { s, player } = setup();
    dart(player, COUNTER.dartLead * .5, -1); updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    dart(player, COUNTER.dartLead * .5, 1, COUNTER.dartMiss * 2); updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    dart(player, COUNTER.dartLead * .5, 1, COUNTER.dartMiss * .5); updateCounterWindow(s, player, 1 / 60); expect(counterState.bolt).toBe(0);
  });
  it('with two darts closing, the nearer one is countered and only it is quenched', () => {
    const { s, player } = setup();
    for (let i = 0; i < 2; i++) { const o = battle.bolts[i]; o.live = true; o.src = 0; Object.assign(o.p, player, { z: player.z - (5 + 2 * i) }); Object.assign(o.v, { x: 0, y: 0, z: BATTLE.speed }); }
    updateCounterWindow(s, player, 1 / 60); expect(counterState.bolt).toBe(0);
    requestCommand(s, COMMAND.context, -1); expect(tryCounter(s, player)).toBe('counter');
    expect(battle.bolts[0].live).toBe(false); expect(battle.bolts[1].live).toBe(true);
  });
  it('closest approach: seconds until the dart passes nearest, -1 once it has passed or misses', () => {
    const at = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 10 };
    expect(dartIntercept({ x: 0, y: 0, z: -5 }, v, at)).toBeCloseTo(.5, 6);
    expect(dartIntercept({ x: 0, y: 0, z: 5 }, v, at)).toBe(-1);
    expect(dartIntercept({ x: COUNTER.dartMiss + .1, y: 0, z: -5 }, v, at)).toBe(-1);
    expect(dartIntercept({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0 }, at)).toBe(-1);
  });
});
describe('a counter is credited only when the dive can run', () => {
  beforeEach(() => resetBulletTime());
  it('a charging demon just beyond the sword reach opens no window', () => {
    const { s, player } = setup(BANISH.swordReach + 2); charging();
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    requestCommand(s, COMMAND.context, -1); expect(tryCounter(s, player)).toBe('');
    expect(battle.charging).toBe(0); expect(counterState.serial).toBe(0);
  });
  it('a hidden attacker, or one with no clear flight path, is not countered', () => {
    let { s, player } = setup(); charging(); s.targets[0].los = false;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    ({ s, player } = setup()); charging(); flowPaths[0] = 0;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    ({ s, player } = setup()); charging(); banish.mode[0] = MODE.down;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
  });
  it('a dart from out of reach is deflected: quenched, no dive, no counter, no slow motion, the press left as it was', () => {
    const { s, player } = setup(BANISH.swordReach + 2);
    const bolt = dart(player, COUNTER.dartLead * .5);
    updateCounterWindow(s, player, 1 / 60);
    expect(counterState.open).toBe(true); expect(counterState.bolt).toBe(0); expect(counterState.attacker).toBe(-1);
    const quenched = battle.quenched; requestCommand(s, COMMAND.context, -1);
    expect(tryCounter(s, player)).toBe('deflect');
    expect(bolt.live).toBe(false); expect(battle.quenched).toBe(quenched + 1); expect(counterState.deflects).toBe(1);
    expect(counterState.serial).toBe(0); expect(s.input.cmdKind).toBe(COMMAND.context); expect(s.input.cmdTarget).toBe(-1);
    expect(stepBulletTime(.1, false, false)).toBe(1);
  });
  it('the attacker turning hidden between the window and the press is re-checked at the press', () => {
    const { s, player } = setup(); charging(); updateCounterWindow(s, player, 1 / 60); expect(counterState.attacker).toBe(0);
    s.targets[0].los = false; requestCommand(s, COMMAND.context, -1);
    expect(tryCounter(s, player)).toBe(''); expect(counterState.serial).toBe(0); expect(s.input.cmdKind).toBe(COMMAND.context);
  });
});
describe('only strike inputs counter', () => {
  beforeEach(() => resetBulletTime());
  for (const [name, kind] of [['bind', COMMAND.bind], ['cast', COMMAND.cast], ['rebuke', COMMAND.rebuke]] as const) {
    it(`${name} keeps its meaning with the window open`, () => {
      const { s, player } = setup(); charging(); updateCounterWindow(s, player, 1 / 60);
      requestCommand(s, kind, 3);
      expect(tryCounter(s, player)).toBe('');
      expect(s.input.cmdKind).toBe(kind); expect(s.input.cmdTarget).toBe(3);
      expect(counterState.open).toBe(true); expect(counterState.serial).toBe(0); expect(battle.charging).toBe(0);
    });
  }
  for (const [name, kind] of [['context', COMMAND.context], ['sword', COMMAND.sword], ['flick', COMMAND.flick]] as const) {
    it(`a ${name} press counters`, () => {
      const { s, player } = setup(); charging(); updateCounterWindow(s, player, 1 / 60);
      requestCommand(s, kind, -1);
      expect(tryCounter(s, player)).toBe('counter'); expect(s.input.cmdKind).toBe(COMMAND.sword); expect(s.input.cmdTarget).toBe(0);
    });
  }
});
describe('slow motion', () => {
  beforeEach(() => resetBulletTime());
  it('drops to the slow scale, holds, eases back to normal; pause holds; reduced motion stays at normal speed', () => {
    expect(stepBulletTime(1 / 60, false, false)).toBe(1);
    startBulletTime(); stepBulletTime(BULLET.attack, false, false);
    expect(stepBulletTime(.1, false, false)).toBeCloseTo(BULLET.slow, 5);
    expect(stepBulletTime(1, true, false)).toBeCloseTo(BULLET.slow, 5); // paused: held
    for (let t = 0; t < 1.2; t += 1 / 60) stepBulletTime(1 / 60, false, false);
    expect(counterState.scale).toBe(1);
    startBulletTime(); expect(stepBulletTime(.2, false, true)).toBe(1);
  });
  it('a reset while slow and paused (the slow clock unmounting) returns game time to normal at once', () => {
    startBulletTime(); stepBulletTime(BULLET.attack + .05, false, false); stepBulletTime(1, true, false);
    expect(counterState.scale).toBeCloseTo(BULLET.slow, 5);
    resetBulletTime();
    expect(counterState.scale).toBe(1); expect(stepBulletTime(1 / 60, true, false)).toBe(1); expect(stepBulletTime(1 / 60, false, false)).toBe(1);
  });
});
