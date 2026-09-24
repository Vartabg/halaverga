import { describe, expect, it } from 'vitest';
import { HEAT, createShooter } from '../src/game/combat';
import { COLORS, SLIDE_MAX, restCannonDrive, type CannonDrive, type RGB } from '../src/world/cannonContract';
import { advanceShotBody, createShotBody } from '../src/world/shotBody';
import { LOCK_CORE, writeCannonDrive } from '../src/world/shotDrive';

const drive = (): CannonDrive => { const d = { coreColor: {}, stripColor: {} } as CannonDrive; restCannonDrive(d); return d; };
const near = (a: RGB, b: RGB) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 1e-6;
function state(heat = 0) {
  const s = createShooter(), b = createShotBody(); s.weapon.heat = heat;
  advanceShotBody(b, s, { dt: 1 / 60, paused: false, reduced: false, epoch: 1, aimWeight: 1, ads: 0, ground: 1, pxPerM: 0 });
  return { s, b, d: drive() };
}

describe('cannon drive', () => {
  it('ramps the strip and core lens colours cool, amber, hot on the HUD thresholds', () => {
    const { s, b, d } = state();
    for (const [heat, color, core] of [[30, COLORS.cool, COLORS.fringe], [70, COLORS.amber, COLORS.amber], [95, COLORS.hot, COLORS.hot]] as const) {
      s.weapon.heat = heat; writeCannonDrive(b, s, 1, false, d); expect(near(d.stripColor, color), `heat ${heat}`).toBe(true);
      expect(near(d.coreColor, core), `core at heat ${heat}`).toBe(true);
    }
    s.weapon.heat = 30; writeCannonDrive(b, s, 1, false, d); expect(d.strip).toBeCloseTo(.45, 12);
    s.weapon.heat = 70; writeCannonDrive(b, s, 1, false, d); expect(d.strip).toBeCloseTo(.6, 12);
    s.weapon.heat = 60; writeCannonDrive(b, s, 1, false, d); expect(d.stripColor.g).toBeGreaterThan(COLORS.cool.g * .4); expect(d.strip).toBeGreaterThan(.45);
  });
  it('swells the hot strip at 1.5 Hz by +-25%', () => {
    const { s, b, d } = state(95), values: number[] = [];
    for (let i = 0; i < 480; i++) { b.time = .01 + i / 120; writeCannonDrive(b, s, 1, false, d); values.push(d.strip); }
    const mean = (Math.max(...values) + Math.min(...values)) / 2, ups: number[] = [];
    for (let i = 1; i < values.length; i++) if (values[i - 1] < mean && values[i] >= mean) ups.push(i / 120);
    expect(ups.length).toBe(6);
    expect((ups.length - 1) / (ups[ups.length - 1] - ups[0])).toBeCloseTo(1.5, 1);
    expect(Math.max(...values) / mean).toBeCloseTo(1.25, 2);
  });
  it('shows exactly one amber swell during the lock, fades strips and fins, and racks the slide with the hatch', () => {
    const { s, b, d } = state(100); const w = s.weapon; w.lock = HEAT.lock; w.justOverheated = true;
    let runs = 0, amber = false, peaks = 0, prev = Infinity, rising = false;
    for (let i = 0; i < 96; i++) {
      w.lockT = i / 60; advanceShotBody(b, s, { dt: 1 / 60, paused: false, reduced: false, epoch: 1, aimWeight: 1, ads: 0, ground: 1, pxPerM: 0 });
      w.justOverheated = false; writeCannonDrive(b, s, 1, false, d);
      const isAmber = d.stripColor.g > .2; if (isAmber && !amber) runs++; amber = isAmber;
      if (d.strip > prev) rising = true; else if (rising && d.strip < prev) { peaks++; rising = false; }
      prev = d.strip;
      expect(d.core).toBe(LOCK_CORE); expect(near(d.coreColor, COLORS.hot)).toBe(true);
      // Strips and fins fade with the lock but hold 3/4 while the hatch stands open.
      expect(d.fins).toBeCloseTo(.6 * Math.max(1 - w.lockT / HEAT.lock, .75 * Math.min(1, Math.max(0, b.hatch))), 12);
      expect(d.slide).toBeCloseTo(Math.min(SLIDE_MAX, SLIDE_MAX * b.hatch), 12); expect(d.vent).toBe(Math.max(0, b.hatch));
      if (w.lockT < .69 || w.lockT > .89) expect(near(d.stripColor, COLORS.hot)).toBe(true);
    }
    expect(runs).toBe(1); expect(peaks).toBe(1); expect(b.hatch).toBeGreaterThan(.95);
  });
  it('drives the core: relaxed, aim raised, firing plus flare, reduced motion, and the ring', () => {
    const { s, b, d } = state(); const w = s.weapon;
    writeCannonDrive(b, s, 0, false, d); expect(d.core).toBe(.55); expect(d.ring).toBeCloseTo(.45, 12); expect(near(d.coreColor, COLORS.fringe)).toBe(true);
    writeCannonDrive(b, s, 1, false, d); expect(d.core).toBeCloseTo(.7, 12); expect(d.ring).toBeCloseTo(.55, 12);
    // A shot this frame: sinceShot 0, flare .15 at age 0 (bold r5 levels: relaxed .55, aim .7, firing .75); the core stays the
    // saturated cyan (no white blend).
    w.sinceShot = 0; b.shotT[0] = b.time;
    writeCannonDrive(b, s, 1, false, d);
    expect(d.core).toBeCloseTo(.9, 12); expect(near(d.coreColor, COLORS.fringe)).toBe(true); expect(d.ring).toBeCloseTo(1.15, 12);
    b.time += .05; w.sinceShot = .05; writeCannonDrive(b, s, 1, false, d); expect(d.core).toBeCloseTo(.75 + .15 * Math.exp(-1), 12);
    writeCannonDrive(b, s, 1, true, d); expect(d.core).toBe(.75); expect(d.ring).toBe(.65);
    // After firing the core eases back to the aim level instead of stepping.
    b.time += 1; w.sinceShot = .3 + 1 / 60; writeCannonDrive(b, s, 1, false, d);
    expect(d.core).toBeLessThan(.75); expect(d.core).toBeGreaterThan(.72);
    w.sinceShot = 3; writeCannonDrive(b, s, 1, false, d); expect(d.core).toBeCloseTo(.7, 6);
    s.weapon.heat = 90; writeCannonDrive(b, s, 1, false, d); expect(d.fins).toBeCloseTo(.3, 12);
  });
  it('rests at the contract rest values when idle', () => {
    const { s, b, d } = state(); const rest = drive();
    writeCannonDrive(b, s, 0, false, d);
    expect(d).toEqual(rest);
  });
});
