import { describe, expect, it } from 'vitest';
import { isOrientationFlip, isPlaying, orientationOf } from '../src/ui/playLifecycle';
// Touch play keeps going through Safari's toolbar resizes; only a real rotation releases held input.
describe('play lifecycle', () => {
  it('a toolbar resize (852x393 → 852x340) is not a flip', () => {
    expect(isOrientationFlip(orientationOf(852, 393), orientationOf(852, 340))).toBe(false);
  });
  it('a rotation (852x393 → 393x852) is a flip, both ways', () => {
    expect(isOrientationFlip(orientationOf(852, 393), orientationOf(393, 852))).toBe(true);
    expect(isOrientationFlip(orientationOf(393, 852), orientationOf(852, 393))).toBe(true);
  });
  it('orientationOf: wider than tall is landscape, a square is portrait', () => {
    expect([orientationOf(852, 393), orientationOf(393, 852), orientationOf(500, 500)]).toEqual(['landscape', 'portrait', 'portrait']);
  });
  it('playing means started with no pause card, settings panel or field guide', () => {
    const live = { started: true, paused: false, panel: false, journal: false };
    expect(isPlaying(live)).toBe(true);
    for (const patch of [{ started: false }, { paused: true }, { panel: true }, { journal: true }]) expect(isPlaying({ ...live, ...patch })).toBe(false);
  });
});
