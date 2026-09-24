import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clearGesture, gesture } from '../src/game/gesture/bus';

describe('gesture bus', () => {
  it('clearGesture keeps scheme, step and exemptHip, zeroes the rest and bumps epoch', () => {
    const step = () => {};
    const g = gesture;
    g.scheme = 'conduct'; g.step = step; g.exemptHip = false;
    g.live = true; g.surge = true; g.velocityOn = true; g.override = true; g.landArmed = true;
    g.intent.forward = .5; g.intent.strafe = -.3; g.intent.vertical = .2;
    g.yawRate = 1; g.pitchRate = -1; g.spin = 3;
    g.velocity.x = 1; g.velocity.y = 2; g.velocity.z = 3;
    g.offset.x = 4; g.offset.y = 5; g.offset.z = 6;
    g.facing = 2; g.request = { kind: 'land', x: 1, y: 2, z: 3 };
    const epoch = g.epoch, intent = g.intent, velocity = g.velocity, offset = g.offset;
    clearGesture();
    expect(g.scheme).toBe('conduct'); expect(g.step).toBe(step); expect(g.exemptHip).toBe(false);
    expect(g.epoch).toBe(epoch + 1);
    expect([g.live, g.surge, g.velocityOn, g.override, g.landArmed]).toEqual([false, false, false, false, false]);
    expect(g.intent).toEqual({ forward: 0, strafe: 0, vertical: 0 });
    expect([g.yawRate, g.pitchRate, g.spin, g.facing]).toEqual([0, 0, 0, 0]);
    expect(g.velocity).toEqual({ x: 0, y: 0, z: 0 }); expect(g.offset).toEqual({ x: 0, y: 0, z: 0 });
    expect(g.request).toBeNull();
    // Zeroed in place: holders of the nested objects see the clear, and nothing was allocated.
    expect(g.intent).toBe(intent); expect(g.velocity).toBe(velocity); expect(g.offset).toBe(offset);
    g.scheme = 'off'; g.step = null; g.exemptHip = true; clearGesture();
  });
  it('bus.ts has no import lines (landing-safe)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/game/gesture/bus.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/^\s*import\b/m);
    expect(src).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
    expect(src).not.toMatch(/^\s*export\s+[^;]*\bfrom\s+['"]/m);
  });
});
