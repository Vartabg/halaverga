import { beforeEach, describe, expect, it } from 'vitest';
import { createShooter } from '../src/game/combat';
import { createDroneSim, buildTargets } from '../src/game/drones';
import { COMMAND, requestCommand } from '../src/game/commands';
import { BATTLE, battle, resetBattle } from '../src/game/celestialBattle';
import { banish, resetBanish } from '../src/game/banish';
import { COUNTER, tryCounter, updateCounterWindow } from '../src/game/counter';
import { counterState } from '../src/game/counterState';
import { BULLET, resetBulletTime, stepBulletTime } from '../src/game/bulletTime';

function setup() {
  const s = createShooter(); createDroneSim(s); buildTargets(s);
  for (const t of s.targets) t.los = true;
  resetBattle(0); resetBanish(banish, s); resetBulletTime();
  const player = { ...s.drones.pos[0], z: s.drones.pos[0].z + 12 };
  return { s, player };
}
describe('Arkham-style counters', () => {
  beforeEach(() => resetBulletTime());
  it('opens only once a charge is under way, and a strike press then counters the attacker', () => {
    const { s, player } = setup();
    battle.charging = 0; battle.charge = BATTLE.windup * COUNTER.chargeOpen * .5;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    battle.charge = BATTLE.windup * .5; updateCounterWindow(s, player, 1 / 60);
    expect(counterState.open).toBe(true); expect(counterState.attacker).toBe(0);
    requestCommand(s, COMMAND.context, -1);
    expect(tryCounter(s, player)).toBe(true);
    expect(s.input.cmdKind).toBe(COMMAND.sword); expect(s.input.cmdTarget).toBe(0);
    expect(battle.charging).toBe(-1); expect(battle.nextAttack).toBeGreaterThan(battle.clock);
    expect(banish.rebukeT).toBe(banish.clock); expect(counterState.serial).toBeGreaterThan(0);
  });
  it('quenches a dart about to land and dives back at the demon that threw it', () => {
    const { s, player } = setup();
    const bolt = battle.bolts[0]; bolt.live = true; bolt.src = 0;
    bolt.p.x = player.x; bolt.p.y = player.y; bolt.p.z = player.z - BATTLE.speed * (COUNTER.dartLead * .5);
    updateCounterWindow(s, player, 1 / 60); expect(counterState.bolt).toBe(0); expect(counterState.attacker).toBe(0);
    const quenched = battle.quenched; requestCommand(s, COMMAND.context, -1); tryCounter(s, player);
    expect(bolt.live).toBe(false); expect(battle.quenched).toBe(quenched + 1); expect(s.input.cmdTarget).toBe(0);
  });
  it('a dart still far out does not open the window, and no press means no counter', () => {
    const { s, player } = setup();
    const bolt = battle.bolts[0]; bolt.live = true; bolt.src = 0; bolt.p.x = player.x; bolt.p.y = player.y; bolt.p.z = player.z - BATTLE.speed * 2;
    updateCounterWindow(s, player, 1 / 60); expect(counterState.open).toBe(false);
    battle.charging = 0; battle.charge = BATTLE.windup; updateCounterWindow(s, player, 1 / 60);
    expect(tryCounter(s, player)).toBe(false); // the command was already handled: no new press
  });
});
describe('slow motion', () => {
  beforeEach(() => resetBulletTime());
  it('drops to the slow scale, holds, eases back to normal; pause holds; reduced motion stays at normal speed', async () => {
    const { startBulletTime } = await import('../src/game/bulletTime');
    expect(stepBulletTime(1 / 60, false, false)).toBe(1);
    startBulletTime(); stepBulletTime(BULLET.attack, false, false);
    expect(stepBulletTime(.1, false, false)).toBeCloseTo(BULLET.slow, 5);
    expect(stepBulletTime(1, true, false)).toBeCloseTo(BULLET.slow, 5); // paused: held
    for (let t = 0; t < 1.2; t += 1 / 60) stepBulletTime(1 / 60, false, false);
    expect(counterState.scale).toBe(1);
    startBulletTime(); expect(stepBulletTime(.2, false, true)).toBe(1);
  });
});
