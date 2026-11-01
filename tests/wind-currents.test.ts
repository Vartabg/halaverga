import { describe, expect, it } from 'vitest';
import { SPEED, START } from '@/game/motion';
import { heightAt } from '@/world/massifData';
import { RING_COOLDOWN, RING_TRIGGER_RADIUS, THERMAL_RINGS, resetWindState, stepThermalRings, windState } from '@/world/windData';

describe('Mount Hermon dawn thermal rings (windData)', () => {
  it('places every thermal ring in open air clear of terrain, arch soffit, and landing pads', () => {
    expect(THERMAL_RINGS.length).toBe(7);
    const highSanctuary = { x: 30, y: 62.415, z: -38 };
    for (const ring of THERMAL_RINGS) {
      const [x, y, z] = ring.position;
      const ground = Math.max(0.1, heightAt(x, z));
      if (ring.id === 'cloven-arch-pass') {
        expect(y).toBeGreaterThan(ground + 3.5);
        expect(y).toBeLessThan(8.65 - 3.0); // well below Cloven Arch stone soffit
      } else {
        expect(y, `${ring.id} must clear ground/water`).toBeGreaterThanOrEqual(ground + 8);
      }
      const distStart = Math.hypot(x - START.x, y - START.y, z - START.z);
      const distSanctuary = Math.hypot(x - highSanctuary.x, y - highSanctuary.y, z - highSanctuary.z);
      expect(distStart, `${ring.id} must clear arrival spawn`).toBeGreaterThan(15);
      expect(distSanctuary, `${ring.id} must clear High Sanctuary landing pad`).toBeGreaterThan(12);
      // Never block the x = 0, y = 20..25 straight test corridor
      const onTestCorridor = Math.abs(x) <= RING_TRIGGER_RADIUS && y >= 18 && y <= 27;
      expect(onTestCorridor, `${ring.id} must stay off straight test line`).toBe(false);
    }
  });

  it('boosts velocity smoothly when flying through a ring and respects cooldown, pause, and landing', () => {
    const cooldowns = new Float64Array(THERMAL_RINGS.length);
    resetWindState(cooldowns);
    const [rx, ry, rz] = THERMAL_RINGS[0].position;
    const pos = { x: rx, y: ry, z: rz }, vel = { x: 0, y: 0, z: -10 };

    // Grounded or paused or landing: no trigger
    expect(stepThermalRings(pos, vel, false, false, false, 1.0, 1 / 60, cooldowns)).toBe(-1);
    expect(stepThermalRings(pos, vel, true, true, false, 1.0, 1 / 60, cooldowns)).toBe(-1);
    expect(stepThermalRings(pos, vel, true, false, true, 1.0, 1 / 60, cooldowns)).toBe(-1);

    // Active flight through ring 0 triggers boost
    const hit = stepThermalRings(pos, vel, true, false, false, 1.0, 1 / 60, cooldowns);
    expect(hit).toBe(0);
    expect(windState.boostTimer).toBeCloseTo(3.0, 5);
    expect(vel.y).toBeGreaterThan(0);
    expect(vel.z).toBeLessThan(-10);
    expect(Math.hypot(vel.x, vel.y, vel.z)).toBeLessThanOrEqual(SPEED.surge + 1e-6);

    // Immediate re-check within RING_COOLDOWN does not re-trigger
    const prevVz = vel.z;
    expect(stepThermalRings(pos, vel, true, false, false, 1.0 + RING_COOLDOWN * 0.5, 0.5, cooldowns)).toBe(-1);
    expect(vel.z).toBe(prevVz);
    expect(windState.boostTimer).toBeLessThan(3.0);

    // After cooldown expires, ring can trigger again
    expect(stepThermalRings(pos, vel, true, false, false, 1.0 + RING_COOLDOWN + 0.1, 1 / 60, cooldowns)).toBe(0);
  });
});
