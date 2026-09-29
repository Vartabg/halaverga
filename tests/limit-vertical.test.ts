// S5 invariants at the sky limit (y = 105) and the water floor (y = 1.7). Hands-off, city off, so only the boundary is in play.
//  - a slide keeps the commanded speed (horizontal speed >= 0.95 x commanded), not speed x cos(pitch);
//  - the suit levels off within 0.35 rad of level inside 1.2 s of reaching the surface when it was pitched into it;
//  - any pitch past 0.45 rad into the surface gets 12 m clear of it within 4 s (cruise) / 2 s (surge).
import { beforeAll, describe, expect, it } from 'vitest';
import { init, Sim, DT, WORLD } from './lim/harness';
import { BUDGET, CLEAR, FLOOR, fly, fmt, heading, late, report, thumb, type Flight } from './lim/drive';
beforeAll(init);
type Surface = { id: string; dist: (y: number) => number; pitches: number[]; y0: number };
const SURFACES: Surface[] = [
  { id: 'ceiling', dist: y => WORLD.ceiling - y, pitches: [.12, .3, .45, .8, 1.25], y0: WORLD.ceiling - 12 },
  { id: 'floor', dist: y => y - FLOOR, pitches: [-.12, -.3, -.45, -.8, -1.3], y0: FLOOR + 12 },
];
/** Fly from 12 m off the surface, aimed into it, from the south so the whole run stays clear of the walls. */
function approach(sf: Surface, pitch: number, v: number) {
  const h = heading(0, pitch), s = new Sim({ x: 0, y: sf.y0, z: 100 }, { city: false });
  s.yaw = 0; s.pitch = pitch; s.v = { x: h.x * v, y: h.y * v, z: h.z * v };
  return s;
}
const steep = (p: number) => Math.abs(p) >= .45;

describe('sky limit and water floor', () => {
  for (const steerOff of [true, false]) {
    it(`slide speed stays >= 0.95 x commanded${steerOff ? ' (steering off: a real slide, no frames skipped)' : ' (whatever slide frames remain)'}`, () => {
      const bad: string[] = [];
      for (const sf of SURFACES) for (const pitch of sf.pitches) for (const v of [8, 13, 34]) {
        const s = approach(sf, pitch, v); let prev = { ...s.p }, worst = Infinity, frames = 0;
        const f = fly(s, thumb(v), { metric: q => sf.dist(q.p.y), contact: 1.6, arm: 12, clear: 1e9, cap: 2, steerOff, each: (q, i, d, t0) => {
          const hs = Math.hypot(q.p.x - prev.x, q.p.z - prev.z) / DT; prev = { ...q.p };
          if (t0 !== null && q.t - t0 >= .5 && d <= 1.8) { frames++; worst = Math.min(worst, hs); }
        } });
        const id = `${sf.id} pitch ${pitch} ${v} m/s`;
        if (f.teleports) bad.push(`${id}: isClear failed ${f.teleports}x`);
        else if (steerOff && frames < 20) bad.push(`${id}: only ${frames} slide frames (the suit never slid)`);
        else if (frames && worst < .95 * v) bad.push(`${id}: no escape, slides at ${worst.toFixed(1)} m/s, ${(100 * worst / v).toFixed(0)}% of the commanded ${v}`);
        s.free();
      }
      expect(bad.length, report(bad)).toBe(0);
    });
  }
  it('pitched into the surface, the suit is within 0.35 rad of level by 1.2 s after reaching it (hands-off)', () => {
    const bad: string[] = [];
    for (const sf of SURFACES) for (const pitch of sf.pitches.filter(steep)) for (const v of [8, 13, 34]) {
      const s = approach(sf, pitch, v); let worst = 0, seen = 0;
      fly(s, thumb(v), { metric: q => sf.dist(q.p.y), contact: 1.6, arm: 12, clear: 1e9, cap: 4, each: (q, i, d, t0) => {
        if (t0 !== null && q.t - t0 >= 1.2 && d <= 1.8) { seen++; worst = Math.max(worst, Math.abs(q.pitch)); }
      } });
      if (seen && worst > .35) bad.push(`${sf.id} pitch ${pitch} ${v} m/s: no escape, still at pitch ${worst.toFixed(2)} 1.2 s after contact, on the surface`);
      s.free();
    }
    expect(bad.length, report(bad)).toBe(0);
  });
  it('pitched into the surface, hands-off, 12 m clear of it within 4 s (cruise) / 2 s (surge), no stall', () => {
    const bad: string[] = [];
    for (const sf of SURFACES) for (const pitch of sf.pitches.filter(steep)) for (const v of [8, 13, 34]) {
      const s = approach(sf, pitch, v), b = BUDGET.vertical(v);
      const f: Flight = fly(s, thumb(v), { metric: q => sf.dist(q.p.y), contact: 1.6, arm: 12, clear: CLEAR.vertical, cap: b + 2 });
      if (late(f, b)) bad.push(fmt(`${sf.id} pitch ${pitch} ${v} m/s`, b, f)); s.free();
    }
    expect(bad.length, report(bad)).toBe(0);
  });
});
