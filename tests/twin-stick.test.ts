import { describe, expect, it } from 'vitest';
import { STICK, createStick, knobOffset, stickCancel, stickCurve, stickDown, stickMove, stickTick, stickUp } from '../src/game/twinStick';
const zone = { l: 24, t: 120, r: 380, b: 360 }, R = 64;
const down = (flying = true, x = 200, y = 250, now = 0) => { const s = createStick(); stickDown(s, 1, x, y, now, R, zone, flying); return s; };
describe('twin stick', () => {
  it('centres the base on the touch point with zero throw and ignores the dead zone', () => {
    const s = down();
    expect([s.baseX, s.baseY, s.forward, s.strafe, s.active]).toEqual([200, 250, 0, 0, true]);
    stickMove(s, 1, 200, 250 - R * .11, 10);
    expect([s.forward, s.strafe, s.out]).toEqual([0, 0, 0]);
    stickMove(s, 1, 200 + R * .119, 250, 20);
    expect(s.out).toBe(0);
    stickMove(s, 1, 200 + R * .13, 250, 30);
    expect(s.out).toBeGreaterThan(0);
  });
  it('rescales past the dead zone and applies the 1.5 curve, forward up and strafe right', () => {
    const s = down();
    for (const m of [.2, .5, .75, 1]) {
      stickMove(s, 1, 200, 250 - R * m, 10);
      const want = Math.pow((m - .12) / .88, 1.5);
      expect(s.out).toBeCloseTo(want, 12); expect(s.forward).toBeCloseTo(want, 12); expect(Math.abs(s.strafe)).toBeLessThan(1e-12);
    }
    stickMove(s, 1, 200 + R, 250, 20);
    expect(s.strafe).toBeCloseTo(1, 12); expect(Math.abs(s.forward)).toBeLessThan(1e-12);
    stickMove(s, 1, 200 + R * .5 * Math.SQRT1_2, 250 + R * .5 * Math.SQRT1_2, 30); // down-right, no axial snapping
    expect(s.strafe).toBeCloseTo(-s.forward, 12); expect(s.strafe).toBeCloseTo(Math.SQRT1_2 * stickCurve(R * .5, R), 12);
  });
  it('draws the knob 1:1 with the thumb inside the rim', () => {
    const s = down();
    stickMove(s, 1, 230, 210, 10);
    expect(knobOffset(s)).toEqual({ x: 30, y: -40 });
  });
  it('follows a sideways overshoot so the thumb sits on the rim, and returns to rest on release', () => {
    const s = down();
    stickMove(s, 1, 200 + 100, 250, 10);
    expect(s.baseX).toBeCloseTo(200 + 36, 9); expect(s.baseY).toBe(250);
    expect(knobOffset(s).x).toBeCloseTo(R, 9); expect(s.strafe).toBeCloseTo(1, 12);
    stickMove(s, 1, 200 + 36 + 20, 250, 20); // pulling back moves the knob, not the base
    expect(s.baseX).toBeCloseTo(200 + 36, 9);
    stickUp(s, 1, 400, true);
    expect([s.active, s.forward, s.strafe, s.id]).toEqual([false, 0, 0, null]); expect(knobOffset(s)).toEqual({ x: 0, y: 0 });
  });
  it('keeps the base still for an upward push until 2 R, so the sprint zone above the ring stays put', () => {
    const s = down();
    stickMove(s, 1, 200, 250 - 1.8 * R, 10);
    expect([s.baseX, s.baseY]).toEqual([200, 250]); expect(s.forward).toBeCloseTo(1, 12); expect(knobOffset(s).y).toBeCloseTo(-R, 9);
    stickMove(s, 1, 200, 250 - 3 * R, 20);
    expect(s.baseY).toBeCloseTo(250 - R, 9); expect(s.reach).toBeCloseTo(2, 9);
  });
  it('clamps the following base inside the zone', () => {
    const s = down(true, 40, 140);
    stickMove(s, 1, -300, -200, 10);
    expect(s.baseX).toBe(zone.l); expect(s.baseY).toBe(zone.t);
    const k = knobOffset(s); expect(Math.hypot(k.x, k.y)).toBeCloseTo(R, 9);
    expect(Math.hypot(s.forward, s.strafe)).toBeCloseTo(1, 12);
  });
  it('ignores a second finger', () => {
    const s = down();
    stickDown(s, 2, 100, 300, 5, R, zone, true); stickMove(s, 2, 100, 100, 6); stickUp(s, 2, 7, true);
    expect([s.id, s.baseX, s.baseY, s.forward, s.active]).toEqual([1, 200, 250, 0, true]);
  });
  it('never boosts a thumb held on the rim, however long: full throw is normal speed', () => {
    const s = down();
    stickMove(s, 1, 200, 250 - R, 0); stickMove(s, 1, 200, 250 - 1.4 * R, 100); stickTick(s, 5000);
    expect([s.out, s.boost]).toEqual([1, false]);
    // Past the rim but short of the sprint zone (1.45 R): still normal speed.
    const t = down(); stickMove(t, 1, 200, 250 - 1.45 * R, 0); stickTick(t, 1000); expect(t.boost).toBe(false);
  });
  it('boosts after 120 ms in the sprint zone (1.5 R, within 35 deg of up), not at 40 deg, and holds until pulled back', () => {
    const s = down();
    stickMove(s, 1, 200, 250 - 1.6 * R, 0);
    stickMove(s, 1, 200, 250 - 1.6 * R, 119); expect(s.boost).toBe(false);
    stickMove(s, 1, 200, 250 - 1.6 * R, 120); expect(s.boost).toBe(true);
    stickMove(s, 1, 200, 250 - R, 130); expect(s.boost).toBe(true); // back on the rim: still boosting (sprint lock)
    const d65 = R * (Math.pow(.65, 1 / 1.5) * .88 + .12);
    stickMove(s, 1, 200, 250 - d65, 300); expect(s.boost).toBe(false);
    const a = 40 * Math.PI / 180, t = down();
    stickMove(t, 1, 200 + 1.7 * R * Math.sin(a), 250 - 1.7 * R * Math.cos(a), 0); stickTick(t, 1000); expect(t.boost).toBe(false);
    const u = down(); stickMove(u, 1, 200, 250 - 1.6 * R, 0); stickTick(u, 130); expect(u.boost).toBe(true); // a thumb held still
    const e = 45 * Math.PI / 180; stickMove(u, 1, 200 + R * Math.sin(e), 250 - R * Math.cos(e), 300); expect(u.boost).toBe(true);
    const x = 55 * Math.PI / 180; stickMove(u, 1, 200 + R * Math.sin(x), 250 - R * Math.cos(x), 310); expect(u.boost).toBe(false);
    const r = down(); stickMove(r, 1, 200, 250 - 1.6 * R, 0); stickTick(r, 200); stickUp(r, 1, 250, true); expect(r.boost).toBe(false);
  });
  it('toggles cruise with a double tap only while flying', () => {
    const tapTwice = (s: ReturnType<typeof createStick>, flying: boolean, t0: number, gap = 100, dx = 10) => {
      stickDown(s, 1, 200, 250, t0, R, zone, flying); stickUp(s, 1, t0 + 80, flying);
      stickDown(s, 1, 200 + dx, 250, t0 + 80 + gap, R, zone, flying); stickUp(s, 1, t0 + 160 + gap, flying);
    };
    const s = createStick();
    tapTwice(s, false, 0); expect(s.cruise).toBe(false);
    tapTwice(s, true, 1000); expect([s.cruise, s.forward, s.strafe]).toEqual([true, 1, 0]);
    tapTwice(s, true, 2000); expect([s.cruise, s.forward]).toEqual([false, 0]);
    tapTwice(s, true, 3000, 301); expect(s.cruise).toBe(false); // too slow
    const f = createStick(); tapTwice(f, true, 0, 100, 40); expect(f.cruise).toBe(false); // too far apart
    const g = createStick(); stickDown(g, 1, 200, 250, 0, R, zone, true); stickUp(g, 1, STICK.tapMs + 1, true);
    stickDown(g, 1, 200, 250, 300, R, zone, true); stickUp(g, 1, 350, true); expect(g.cruise).toBe(false); // first press too long
  });
  it('cancels cruise with held travel past the dead zone and keeps it through a still hold', () => {
    const s = createStick();
    stickDown(s, 1, 200, 250, 0, R, zone, true); stickUp(s, 1, 50, true);
    stickDown(s, 1, 200, 250, 100, R, zone, true); stickUp(s, 1, 150, true);
    expect(s.cruise).toBe(true);
    stickDown(s, 1, 200, 250, 1000, R, zone, true); stickMove(s, 1, 202, 250, 1010);
    expect([s.cruise, s.forward]).toEqual([true, 1]);
    stickMove(s, 1, 200 + R * .3, 250, 1020);
    expect(s.cruise).toBe(false); expect(s.forward).toBeCloseTo(0, 12);
    stickUp(s, 1, 1500, true); expect(s.forward).toBe(0);
  });
  it('stickCancel zeroes everything, cruise and boost included', () => {
    const s = down();
    s.cruise = true; s.boost = true; stickMove(s, 1, 200, 150, 10);
    stickCancel(s);
    expect([s.id, s.active, s.forward, s.strafe, s.boost, s.cruise, s.out]).toEqual([null, false, 0, 0, false, false, 0]);
    stickDown(s, 7, 100, 300, 20, R, zone, true); expect(s.id).toBe(7);
  });
});
