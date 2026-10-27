import { describe, expect, it } from 'vitest';
import {
  generateRunes,
  updateRunes,
  checkCleaveHit,
  checkRuneHit,
  spawnShards,
  updateShards,
  RUNE_WARN_TIME,
} from '@/game/semjazaAttacks';

describe('Semjaza Attack Patterns & Hitboxes', () => {
  it('generates 3 ground runes around target', () => {
    const runes = generateRunes(0, 0, 0, 10, 20);
    expect(runes).toHaveLength(3);
    expect(runes[0].x).toBe(10);
    expect(runes[0].z).toBe(20);
    expect(runes[0].erupted).toBe(false);
  });

  it('erupts ground runes after warning time and detects hit', () => {
    const runes = generateRunes(0, 0, 0, 10, 20);
    // Before warning time: no hit
    updateRunes(runes, RUNE_WARN_TIME * 0.5);
    expect(runes[0].erupted).toBe(false);
    expect(checkRuneHit(runes, 10, 0, 20)).toBe(false);

    // Advance to warning completion (timer = 1.25, within damage window [1.2, 1.7])
    updateRunes(runes, RUNE_WARN_TIME * 0.55);
    expect(runes[0].erupted).toBe(true);
    expect(checkRuneHit(runes, 10, 0, 20)).toBe(true);
  });

  it('calculates staff cleave arc accurately in front of boss', () => {
    // Boss at (0, 0) facing +z (yaw = 0)
    // Player directly in front at (0, 4): should hit during active swing window (t = 0.6)
    const inFrontHit = checkCleaveHit(0, 0, 0, 0, 4, 0.6);
    expect(inFrontHit).toBe(true);

    // Player behind boss at (0, -4): should miss
    const behindHit = checkCleaveHit(0, 0, 0, 0, -4, 0.6);
    expect(behindHit).toBe(false);

    // Player too far away at (0, 15): should miss
    const farHit = checkCleaveHit(0, 0, 0, 0, 15, 0.6);
    expect(farHit).toBe(false);
  });

  it('spawns and updates obsidian shards in Phase 2', () => {
    const shards = spawnShards(0, 20, 0, 6);
    expect(shards).toHaveLength(6);
    expect(shards.every(s => s.active)).toBe(true);

    updateShards(shards, 3.0, 0);
    // After 3s falling from y=22 at vy=-8, they hit ground y=0 and deactivate
    expect(shards.every(s => !s.active)).toBe(true);
  });
});
