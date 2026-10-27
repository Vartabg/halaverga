import { describe, expect, it } from 'vitest';
import { createSemjaza, updateSemjaza, damageSemjaza, MAX_HP, ARENA_CENTER, ARENA_RADIUS } from '@/game/semjazaBoss';

describe('Semjaza Boss State Machine', () => {
  it('initializes in intro state with full HP and visible banner', () => {
    const boss = createSemjaza();
    expect(boss.state).toBe('intro');
    expect(boss.hp).toBe(MAX_HP);
    expect(boss.bannerVisible).toBe(true);
    expect(boss.introDone).toBe(false);
  });

  it('transitions from intro to stride after intro duration', () => {
    const boss = createSemjaza();
    updateSemjaza(boss, 3.5, ARENA_CENTER.x + 10, ARENA_CENTER.y, ARENA_CENTER.z);
    expect(boss.state).toBe('stride');
    expect(boss.introDone).toBe(true);
    expect(boss.bannerVisible).toBe(false);
  });

  it('triggers Phase 2 ascension when HP drops below 50%', () => {
    const boss = createSemjaza();
    // Complete intro
    updateSemjaza(boss, 3.5, ARENA_CENTER.x, ARENA_CENTER.y, ARENA_CENTER.z);
    // Deal 550 damage (HP -> 450)
    damageSemjaza(boss, 550);
    updateSemjaza(boss, 0.1, ARENA_CENTER.x + 5, ARENA_CENTER.y, ARENA_CENTER.z);
    expect(boss.phase).toBe(2);
    expect(boss.state).toBe('ascension');
  });

  it('enters defeated state when HP reaches 0', () => {
    const boss = createSemjaza();
    updateSemjaza(boss, 3.5, ARENA_CENTER.x, ARENA_CENTER.y, ARENA_CENTER.z);
    const dead = damageSemjaza(boss, MAX_HP);
    expect(dead).toBe(true);
    expect(boss.state).toBe('defeated');
    expect(boss.hp).toBe(0);
  });

  it('strictly constrains boss within arena radius', () => {
    const boss = createSemjaza();
    updateSemjaza(boss, 3.5, ARENA_CENTER.x, ARENA_CENTER.y, ARENA_CENTER.z);
    // Push far beyond arena
    boss.x = ARENA_CENTER.x + ARENA_RADIUS * 2;
    boss.z = ARENA_CENTER.z + ARENA_RADIUS * 2;
    updateSemjaza(boss, 0.1, ARENA_CENTER.x + 500, ARENA_CENTER.y, ARENA_CENTER.z + 500);
    const dist = Math.hypot(boss.x - ARENA_CENTER.x, boss.z - ARENA_CENTER.z);
    expect(dist).toBeLessThanOrEqual(ARENA_RADIUS + 0.01);
  });
});
