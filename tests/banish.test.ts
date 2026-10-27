import { describe, expect, it } from 'vitest';
import { PHASE, createShooter } from '../src/game/combat';
import { COMMAND, requestCommand, SHIELD } from '../src/game/commands';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { BANISH, MODE, createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { resetBattle, battle, shielded } from '../src/game/celestialBattle';
import { cancelStrike, strike } from '../src/game/strike';

function setup() {
  const s = createShooter(); createDroneSim(s); buildTargets(s);
  for (const t of s.targets) t.los = true;
  const b = createBanish(); resetBanish(b, s); resetBattle(0);
  const near = { ...s.drones.pos[0], z: s.drones.pos[0].z + 10 }, far = { ...s.drones.pos[0], z: s.drones.pos[0].z + 200 };
  const act = (kind: number, at = near) => { requestCommand(s, kind, 0); stepBanish(b, s, at, 1 / 60); };
  // The sword dives (strike.ts): the blow lands when the angel reaches the demon.
  const blow = (kind: number = COMMAND.sword) => { act(kind); expect(strike.phase).toBe(1); stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); };
  cancelStrike();
  return { s, b, near, far, act, blow };
}
describe('textual banishment loop', () => {
  it('rebuke staggers, the sword throws down, the chain binds and the cast seals it into the abyss', () => {
    const { s, b, near, act, blow } = setup();
    act(COMMAND.rebuke);
    expect(b.mode[0]).toBe(MODE.staggered); expect(b.resist[0]).toBe(BANISH.resistance - 1); expect(b.rebukeT).toBe(b.clock);
    act(COMMAND.sword); expect(b.resist[0]).toBe(BANISH.resistance - 1); // diving, not yet struck
    stepBanish(b, s, { ...s.targets[0].c }, 1 / 60); expect(b.resist[0]).toBe(1); expect(strike.phase).toBe(2);
    expect(s.camFx.trauma).toBeGreaterThan(0);
    blow();
    expect(b.mode[0]).toBe(MODE.down); expect(s.drones.held[0]).toBe(1);
    act(COMMAND.bind); expect(b.mode[0]).toBe(MODE.bound);
    act(COMMAND.flick); expect(b.mode[0]).toBe(MODE.cast);
    for (let t = 0; t < BANISH.castTime + .1; t += 1 / 60) stepBanish(b, s, near, 1 / 60);
    expect(s.drones.phase[0]).toBe(PHASE.dying); expect(s.stats.kills).toBe(1); expect(s.drones.held[0]).toBe(0);
  });
  it('refuses out of order or out of reach, and says why', () => {
    const { b, far, act } = setup();
    act(COMMAND.bind); expect(b.cue).toBe('notDown'); expect(b.mode[0]).toBe(MODE.free);
    act(COMMAND.sword, far); expect(b.cue).toBe('far');
    act(COMMAND.cast); expect(b.cue).toBe('notDown');
  });
  it('a flick on a free demon is a sword stroke; a thrown-down demon recovers unless bound', () => {
    const { s, b, near, blow } = setup();
    blow(COMMAND.flick); expect(b.resist[0]).toBe(BANISH.resistance - BANISH.swordHurt);
    blow(); blow(); expect(b.mode[0]).toBe(MODE.down);
    for (let t = 0; t < BANISH.downTime + .1; t += 1 / 30) stepBanish(b, s, near, 1 / 30);
    expect(b.mode[0]).toBe(MODE.free); expect(b.resist[0]).toBe(BANISH.recover); expect(s.drones.held[0]).toBe(0);
  });
  it('a rebuke breaks a charging attack', () => {
    const { b, act } = setup();
    battle.charging = 0; act(COMMAND.rebuke);
    expect(battle.charging).toBe(-1); expect(b.mode[0]).toBe(MODE.staggered);
  });
  it('the shield quenches darts from the front only, and only while held', () => {
    const s = createShooter(); s.aim.dir = { x: 0, y: 0, z: -1 };
    const incoming = { x: 0, y: 0, z: 19 }, behind = { x: 0, y: 0, z: -19 };
    expect(shielded(s, incoming)).toBe(false);
    s.input.shield = SHIELD.touch;
    expect(shielded(s, incoming)).toBe(true); expect(shielded(s, behind)).toBe(false);
  });
});
describe('the context step', () => {
  it('rebukes again out of sword reach, takes the sword within it, then binds and casts', async () => {
    const { contextKind } = await import('../src/game/banish');
    const b = createBanish();
    expect(contextKind(b, 0, 10)).toBe(COMMAND.rebuke);
    b.mode[0] = MODE.staggered;
    expect(contextKind(b, 0, BANISH.swordReach + 1)).toBe(COMMAND.rebuke); expect(contextKind(b, 0, 10)).toBe(COMMAND.sword);
    b.mode[0] = MODE.down; expect(contextKind(b, 0, 40)).toBe(COMMAND.bind);
    b.mode[0] = MODE.bound; expect(contextKind(b, 0, 40)).toBe(COMMAND.cast);
  });
});
