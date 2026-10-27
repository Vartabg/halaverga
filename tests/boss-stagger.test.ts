import { describe, expect, it, beforeEach } from 'vitest';
import { applyStagger, createSemjaza, damageSemjaza, updateSemjaza, MAX_STAGGER } from '../src/game/semjazaBoss';

describe('boss posture stagger system', () => {
  let boss: ReturnType<typeof createSemjaza>;

  beforeEach(() => {
    boss = createSemjaza();
    boss.state = 'stride'; // Past intro
  });

  it('accumulates posture stagger without breaking below max', () => {
    expect(boss.stagger).toBe(0);
    applyStagger(boss, 25);
    expect(boss.stagger).toBe(25);
    expect(boss.state).toBe('stride');
  });

  it('triggers 2.5s posture broken kneeling state when reaching max stagger', () => {
    applyStagger(boss, 50);
    expect(boss.stagger).toBe(50);
    const broken = applyStagger(boss, 50);
    expect(broken).toBe(true);
    expect(boss.stagger).toBe(MAX_STAGGER);
    expect(boss.state).toBe('stagger');
    expect(boss.staggerTimer).toBeCloseTo(2.5, 2);
  });

  it('applies 1.5x damage multiplier when boss is posture broken in stagger state', () => {
    applyStagger(boss, 100);
    expect(boss.state).toBe('stagger');
    const startHp = boss.hp;
    damageSemjaza(boss, 100);
    // 100 * 1.5 = 150 damage
    expect(boss.hp).toBe(startHp - 150);
  });

  it('decays stagger posture if no hits taken for over 4 seconds', () => {
    applyStagger(boss, 40);
    expect(boss.stagger).toBe(40);
    // Step 2 seconds: no decay yet (total 2.0s < 4.0s)
    updateSemjaza(boss, 2.0, 30, 38, -38);
    expect(boss.stagger).toBe(40);
    // Step another 2.5 seconds (total 4.5s > 4.0s threshold): begins decaying
    updateSemjaza(boss, 2.5, 30, 38, -38);
    expect(boss.stagger).toBeLessThan(40);
  });

  it('recovers from stagger back to stride with zero stagger posture', () => {
    applyStagger(boss, 100);
    expect(boss.state).toBe('stagger');
    // Step past stagger timer (2.5s)
    updateSemjaza(boss, 2.6, 30, 38, -38);
    expect(boss.state).toBe('stride');
    expect(boss.stagger).toBe(0);
  });
});
