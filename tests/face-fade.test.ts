import { describe, expect, it } from 'vitest';
import { FACE_MAX, OTHER, easeFace, faceRange, faceTarget } from '../src/game/faceFade';
// Limits review F3 + F10: the six district faces. Numbers only (world/BoundaryFaces.tsx draws them).
describe('the district faces', () => {
  it('the nearest wall is at full strength by 15 m at cruise and 25 m at surge (it measured under 2% of pixels there before)', () => {
    expect(faceTarget('wall', 15, 8, true, '')).toBeCloseTo(FACE_MAX, 5);
    expect(faceTarget('wall', 25, 34, true, '')).toBeCloseTo(FACE_MAX, 5);
    expect(faceTarget('wall', 30, 34, true, '')).toBeCloseTo(FACE_MAX, 5);
  });
  it('a wall fades in over its range (30 m at cruise, 60 m at surge), is gone beyond it, and a far face stays at 45%', () => {
    expect(faceRange(8)).toBe(30); expect(faceRange(34)).toBe(60);
    for (const speed of [0, 8, 13, 34]) {
      expect(faceTarget('wall', faceRange(speed) + 1, speed, true, '')).toBe(0);
      let last = 0; for (let g = faceRange(speed); g >= 0; g -= 1) { const t = faceTarget('wall', g, speed, true, ''); expect(t).toBeGreaterThanOrEqual(last - 1e-12); last = t; }
    }
    expect(faceTarget('wall', 10, 8, false, '')).toBeCloseTo(FACE_MAX * OTHER, 5);
  });
  it('the flooded-boulevard skim shows no floor grid: the floor and the sky face wait for their own limit cue', () => {
    // The tutorial route skims the water at y 3.2, 1.5 m over the 1.7 m flying floor, at cruise.
    expect(faceTarget('floor', 1.5, 8, true, '')).toBe(0);
    expect(faceTarget('floor', 1.5, 8, true, 'wall')).toBe(0);
    expect(faceTarget('floor', 20, 34, true, '')).toBe(0);
    expect(faceTarget('ceiling', 5, 13, true, '')).toBe(0);
    expect(faceTarget('floor', 12, 8, true, 'floor')).toBeGreaterThan(.5);
    expect(faceTarget('ceiling', 12, 8, true, 'ceiling')).toBeGreaterThan(.5);
    expect(faceTarget('floor', 12, 8, true, 'ceiling')).toBe(0);
  });
  it('eases toward the target over 0.3 s, both ways, and never overshoots (a flickering cue does not flicker the picture)', () => {
    let level = 0; for (let i = 0; i < 9; i++) level = easeFace(level, FACE_MAX, 1 / 30);
    expect(level).toBeGreaterThan(0); expect(level).toBeLessThan(FACE_MAX + 1e-9);
    for (let i = 0; i < 30; i++) level = easeFace(level, FACE_MAX, 1 / 30);
    expect(level).toBeCloseTo(FACE_MAX, 9);
    let a = 0; for (let i = 0; i < 60; i++) a = easeFace(a, i % 2 ? FACE_MAX : 0, 1 / 60);
    expect(a).toBeLessThan(FACE_MAX * .3);
  });
});
