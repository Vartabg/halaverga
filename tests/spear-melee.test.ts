import { describe, expect, it, beforeEach } from 'vitest';
import { resolveMeleeHit, MELEE_RANGE } from '../src/game/spearMelee';
import { bossRuntime } from '../src/game/bossRuntime';
import { runtime } from '../src/game/runtime';
import { hitstopState, resetHitstop } from '../src/game/hitstop';

describe('spear melee hit resolution', () => {
  beforeEach(() => {
    resetHitstop();
    bossRuntime.boss.state = 'stride';
    bossRuntime.boss.hp = 1000;
    bossRuntime.boss.stagger = 0;
    bossRuntime.boss.x = 30;
    bossRuntime.boss.y = 38;
    bossRuntime.boss.z = -38;

    runtime.position.x = 30;
    runtime.position.y = 38;
    runtime.position.z = -35; // 3m away (within MELEE_RANGE)
    runtime.yaw = 0; // Facing -z toward boss

    bossRuntime.combat.attacking = false;
    bossRuntime.combat.diveSmiting = false;
    bossRuntime.combat.combo = 1;
    bossRuntime.combat.attackTimer = 0;
  });

  it('returns no hit when player is not attacking', () => {
    const res = resolveMeleeHit();
    expect(res.hit).toBe(false);
    expect(hitstopState.active).toBe(false);
  });

  it('registers melee strike within range and active window', () => {
    bossRuntime.combat.attacking = true;
    bossRuntime.combat.attackTimer = 0.15; // Active window
    bossRuntime.combat.combo = 1;

    const res = resolveMeleeHit();
    expect(res.hit).toBe(true);
    expect(res.damage).toBe(45);
    expect(bossRuntime.boss.hp).toBe(955);
    expect(bossRuntime.boss.stagger).toBe(15);
    expect(hitstopState.active).toBe(true);
    expect(hitstopState.timer).toBeCloseTo(0.08, 3);
  });

  it('scales damage and stagger on combo progression', () => {
    bossRuntime.combat.attacking = true;
    bossRuntime.combat.attackTimer = 0.15;
    bossRuntime.combat.combo = 3; // Finisher

    const res = resolveMeleeHit();
    expect(res.hit).toBe(true);
    expect(res.damage).toBe(110);
    expect(bossRuntime.boss.stagger).toBe(40);
  });

  it('registers dive smite with larger shockwave radius and higher hitstop', () => {
    bossRuntime.combat.diveSmiting = true;
    runtime.position.z = -32; // 6m away (outside normal melee 5.2m, inside smite 7.5m)

    const res = resolveMeleeHit();
    expect(res.hit).toBe(true);
    expect(res.damage).toBe(140);
    expect(res.smite).toBe(true);
    expect(bossRuntime.boss.stagger).toBe(50);
    expect(hitstopState.timer).toBeCloseTo(0.10, 3); // 100ms
  });
});
