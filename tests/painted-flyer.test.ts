import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paintBlockGeometry } from '../src/world/paintBlocks';
import PaintedFlyer from '../src/world/PaintedFlyer';
import { FLIER, paintedFlyerBlocks } from '../src/world/paintedFlyerPose';
import { villagerBlocks } from '../src/world/villagerPose';

const PALLET_SRC = readFileSync('src/world/villagerPose.ts', 'utf8');
// Bare hex values, one source of truth: the villager's exported palette.
const palette = (PALLET_SRC.match(/'#([0-9a-f]{6})'/g) ?? []).map(s => s.slice(2, -1).trim().replace(/^#/, ''));

describe('winged painted man', () => {
  it('hovers over the village court with the face toward the arrival camera', () => {
    const parts = paintedFlyerBlocks('hover');
    const feet = Math.min(...parts.map(p => p.y - p.h / 2));
    const head = Math.max(...parts.map(p => p.y + p.h / 2));
    // Hovering: the trail of the robe dips but nothing sits on the court plane.
    expect(FLIER.y).toBeGreaterThan(21);
    expect(FLIER.x).toBeCloseTo(0);
    expect(Math.abs(FLIER.z - 65)).toBeLessThan(1.5);
    const eye = parts.filter(p => p.color === PALLET_SRC.match(/EYE = '(#\w+)'/)?.[1]);
    expect(eye.length).toBe(2);
    expect(Math.max(...eye.map(p => p.z))).toBeLessThan(0);
    expect(head).toBeGreaterThan(1.8);
    expect(feet).toBeGreaterThan(-2);
  });

  it('counts wings: two mirrored wing assemblies with five primaries and a shadow row', () => {
    const parts = paintedFlyerBlocks('hover');
    const mirror = (p: { x: number }) => (p.x > 0.3 ? 1 : p.x < -0.3 ? -1 : 0);
    const sides = new Set(parts.map(mirror));
    expect([...sides].sort()).toEqual([-1, 0, 1]);
    const linen = PALLET_SRC.match(/LINEN = '(.+?)'/)?.[1] ?? '';
    const sole = PALLET_SRC.match(/SOLE = '(.+?)'/)?.[1] ?? '';
    const leftWing = parts.filter(p => p.x < -0.3 && p.y > 0.9);
    const rightWing = parts.filter(p => p.x > 0.3 && p.y > 0.9);
    expect(leftWing.length).toBeGreaterThanOrEqual(8);
    expect(leftWing.length).toBe(rightWing.length);
    expect(leftWing.filter(p => p.color === sole).length).toBe(1);
    expect(leftWing.filter(p => p.color === linen).length).toBeGreaterThanOrEqual(6);
    const span = Math.max(...parts.map(p => Math.abs(p.x) + p.w / 2));
    expect(span).toBeGreaterThan(2);
    expect(span).toBeLessThan(2.6);
  });

  it('keeps one count same across poses but different silhouettes', () => {
    const hover = paintedFlyerBlocks('hover');
    const bank = paintedFlyerBlocks('bank');
    const dive = paintedFlyerBlocks('dive');
    expect(bank.length).toBe(hover.length);
    expect(dive.length).toBe(hover.length);
    expect(JSON.stringify(bank)).not.toBe(JSON.stringify(hover));
    expect(JSON.stringify(dive)).not.toBe(JSON.stringify(hover));
    expect(JSON.stringify(paintedFlyerBlocks('hover'))).toBe(JSON.stringify(hover));
  });

  it('rides the paint bar: villager palette only, vertex colors, no suit remnants', () => {
    const geometry = paintBlockGeometry(paintedFlyerBlocks('hover'));
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.dispose();
    const allowed = new Set(palette);
    for (const part of paintedFlyerBlocks('hover')) expect(allowed.has(part.color.replace(/^#/, ''))).toBe(true);
    const src = readFileSync('src/world/PaintedFlyer.tsx', 'utf8') + readFileSync('src/world/paintedFlyerPose.ts', 'utf8');
    const inSrc = [...new Set((src.match(/'#([0-9a-f]{6})'/g) ?? []).map(s => s.slice(2, -1)))];
    for (const color of inSrc) expect(allowed.has(color)).toBe(true);
    expect(inSrc.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/suit\.glb|skinnedSuit|CuboidCollider|archangelWings/i);
    expect(src).not.toMatch(/Semjaza|Azazel|Kokabiel/);
  });

  it('mounts in the city only behind the flyer dev flag', () => {
    const city = readFileSync('src/world/City.tsx', 'utf8');
    expect(city).toContain('showFlyer');
    expect(city).toContain('<PaintedFlyer />');
    expect(city).toMatch(/flyer/);
    expect(city.indexOf('showFlyer')).toBeLessThan(city.indexOf('return <'));
    // The shipped scene stays unchanged by default: the gate is a window check, default off.
    expect(city).toMatch(/typeof window/);
  });
});
