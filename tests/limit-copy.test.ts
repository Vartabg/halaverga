import { beforeEach, describe, expect, it } from 'vitest';
import { limitCue, CUE_S, FLOOR_CUE_S, NEAR_M } from '../src/game/limitCue';
import { LIMIT_TEXT, inputKind, limitHint, resetLimitTips } from '../src/game/limitCopy';
import { CLEARANCE, allowedClosing, keepSlide, softenBounds } from '../src/game/navigation';
import { WORLD } from '../src/game/motion';
import { holdCue, resetCueHold } from '../src/game/limitStep';
// Limits plan S2/S3/S5a in pure numbers: the soft limiter, the cue rule and its words, the full-speed slide.
const at = (x: number, y: number, z: number) => ({ x, y, z }), still = at(0, 0, 0);
describe('the soft limiter', () => {
  it('drops the closing speed by exactly brake x step a frame (never the 105-152 m/s2 peaks of the old 65)', () => {
    expect(CLEARANCE.brake).toBe(30);
    let d = 40, v = 34, worst = 0;
    for (let i = 0; i < 600 && v > 0; i++) { const next = Math.min(v, allowedClosing(d)); worst = Math.max(worst, (v - next) * 60); v = next; d -= v / 60; }
    expect(worst).toBeLessThanOrEqual(30.01); expect(d).toBeGreaterThan(CLEARANCE.buffer - .05);
  });
  it('stops at the same points as before: 1.14 m from a wall, 0.54 m under the ceiling, the floor at 1.7 m', () => {
    const p = { x: WORLD.maxX - 1.14, y: 70, z: 0 };
    expect(softenBounds(p, at(34, 0, 0)).x).toBeLessThan(1e-9); expect(softenBounds({ ...p, x: p.x - 3 }, at(34, 0, 0)).x).toBeGreaterThan(3);
    expect(softenBounds(at(0, WORLD.ceiling - .54, 0), at(0, 5, 0)).y).toBeLessThan(1e-9); expect(softenBounds(at(0, 1.7, 0), at(0, -5, 0)).y).toBeGreaterThan(-1e-9);
  });
});
describe('the cue', () => {
  it('shows for a wall by time (2.5 s at the closing speed) or under 12 m while closing (4 m when not), and not while turned away', () => {
    expect(limitCue(at(WORLD.maxX - 19, 70, 0), at(8, 0, 0), null, false)).toBe('wall'); // 19 m at 8 m/s: 2.4 s
    expect(limitCue(at(WORLD.maxX - 40, 70, 0), at(8, 0, 0), null, false)).toBe('');
    expect(limitCue(at(WORLD.maxX - 80, 70, 0), at(34, 0, 0), null, false)).toBe('wall'); // 80 m at 34 m/s: 2.35 s
    expect(limitCue(at(WORLD.maxX - 3, 70, 0), still, null, false)).toBe('wall'); // pinned near the edge
    expect(limitCue(at(WORLD.maxX - 11, 70, 0), at(3, 0, 0), null, false)).toBe('wall'); // closing under 12 m
    expect(limitCue(at(WORLD.maxX - 5, 70, 0), at(-8, 0, 0), null, false)).toBe(''); // 5 m out and moving away: the nose is already clear
    expect(limitCue(at(WORLD.maxX - 8, 70, 0), at(0, 0, 8), null, false)).toBe(''); // running along the edge
    expect(limitCue(at(WORLD.maxX - 11, 70, 0), still, null, false)).toBe('');
    expect(limitCue(at(WORLD.maxX - 40, 70, 0), at(-8, 0, 0), null, false)).toBe(''); expect(CUE_S).toBe(2.5); expect(NEAR_M).toBe(12);
  });
  it('names the sky, the water (only while closing on it) and a solid ahead', () => {
    expect(limitCue(at(0, WORLD.ceiling - 19, 0), at(0, 8, 0), null, false)).toBe('ceiling');
    expect(limitCue(at(0, 12, 0), at(0, -6, 0), null, false)).toBe('floor'); expect(FLOOR_CUE_S).toBe(3);
    expect(limitCue(at(0, 1.7 + 16, 0), at(0, -6, 0), null, false)).toBe('floor'); // 2.7 s out: the water cues 3 s ahead expect(limitCue(at(0, 3, 0), at(8, 0, 0), null, false)).toBe(''); // a low cruise over the water is silent
    expect(limitCue(at(0, 50, 0), at(8, 0, 0), { time: 2, incidence: .9 }, false)).toBe('solid');
    expect(limitCue(at(0, 50, 0), at(8, 0, 0), { time: 2, incidence: .1 }, false)).toBe(''); expect(limitCue(at(0, 50, 0), at(8, 0, 0), { time: 3, incidence: .9 }, false)).toBe('');
    expect(limitCue(at(0, 50, 0), still, null, true)).toBe('solid');
  });
});
describe('the words', () => {
  beforeEach(resetLimitTips);
  it('every limit names the fix; the edge shows the turn tip once per input kind, then the short label', () => {
    expect(limitHint('ceiling', 'touch')).toBe(LIMIT_TEXT.ceiling); expect(limitHint('floor', 'touch')).toBe(LIMIT_TEXT.floor); expect(limitHint('solid', 'touch')).toBe(LIMIT_TEXT.solid);
    expect(limitHint('', 'touch')).toBe('');
    expect(limitHint('wall', 'touch')).toBe(LIMIT_TEXT.wallTip.touch); expect(limitHint('wall', 'touch')).toBe(LIMIT_TEXT.wallTip.touch); // the tip stays while the cue does
    expect(limitHint('', 'touch')).toBe(''); expect(limitHint('wall', 'touch')).toBe(LIMIT_TEXT.wall);
    expect(limitHint('', 'cursor')).toBe(''); expect(limitHint('wall', 'cursor')).toBe(LIMIT_TEXT.wallTip.cursor);
    for (const text of [...Object.values(LIMIT_TEXT.wallTip), LIMIT_TEXT.ceiling, LIMIT_TEXT.floor, LIMIT_TEXT.solid]) expect(text.length).toBeLessThanOrEqual(38);
  });
  it('tells touch, the free cursor and slide-to-look apart', () => {
    expect(inputKind(true, 'free', 'trackpad')).toBe('touch'); expect(inputKind(false, 'free', 'trackpad')).toBe('cursor'); expect(inputKind(false, 'flow', 'trackpad')).toBe('cursor');
    expect(inputKind(false, 'simple', 'trackpad')).toBe('slide'); expect(inputKind(false, 'free', 'mouse')).toBe('slide');
  });
});
describe('the slide at the ceiling and the water', () => {
  it('rises to the commanded speed at the surface and leaves open air and the pilot leaving alone', () => {
    const target = at(0, 24.4, -23.7), v = at(0, 0, -23.7); // pitch 0.8 at 34 m/s: the slide was 70% of the ask
    const held = keepSlide(at(0, WORLD.ceiling - .6, 0), v, target); expect(Math.hypot(held.x, held.z)).toBeGreaterThan(.99 * 34);
    expect(keepSlide(at(0, WORLD.ceiling - 6, 0), v, target)).toBe(v); // outside the zone
    expect(keepSlide(at(0, WORLD.ceiling - .6, 0), v, at(0, -24, -23.7))).toBe(v); // commanded away from the ceiling
    const down = keepSlide(at(0, 2, 0), at(0, 0, -8), at(0, -7.6, -2.5)); expect(Math.hypot(down.x, down.z)).toBeGreaterThan(7.9); // floor, pitch -1.25 at 8 m/s
  });
});
describe('the cue hold', () => {
  beforeEach(resetCueHold);
  it('a cue that flickers off every other step (a solid look-ahead in a slide) stays on, and ends 0.4 s after its last report', () => {
    for (let i = 0; i < 40; i++) expect(holdCue(i % 2 ? '' : 'solid')).toBe('solid');
    let steps = 0; while (holdCue('') === 'solid' && steps < 100) steps++;
    expect(steps).toBeGreaterThanOrEqual(22); expect(steps).toBeLessThanOrEqual(25); // 0.4 s at 60 Hz
    expect(holdCue('')).toBe('');
  });
  it('a new cue replaces the held one at once, and a reset drops it', () => {
    holdCue('wall'); expect(holdCue('ceiling')).toBe('ceiling'); resetCueHold(); expect(holdCue('')).toBe('');
  });
});
