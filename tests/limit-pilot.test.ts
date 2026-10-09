// Limits review (2026-09-29): the pilot's own input, and what counts as a problem.
//  - a flight that only runs parallel to an edge (no contact, no inward speed) keeps its heading exactly;
//  - backing away with S (or strafing off) is never fought by the heading nudge: as fast as with steering off, heading untouched;
//  - a slide-look turn, a held trigger and twin-touch level flight are the pilot's: the nudge does not rewrite yaw or pitch;
//  - a thumb resting in the edge zone (a slow turn) does not switch the nudge off: the suit still gets out;
//  - a stale latch is dropped when flight stops.
import { beforeAll, describe, expect, it } from 'vitest';
import { init, Sim, DT, WORLD, type Model } from './lim/harness';
import { BUDGET, CLEAR, FLOOR, WALLS, fly, heading, thumb, wallEntry } from './lim/drive';
import { idleLimitSteer, limitSteer, peeling, resetLimitSteer } from '../src/game/limitSteer';
beforeAll(init);
const keys = (k: string[], surge = false): Model => ({ kind: 'keys', keys: k, surge });

describe('a problem, not a place', () => {
  it('flying parallel to an edge from 3 to 25 m out keeps its heading and path exactly (both directions, every wall)', () => {
    const bad: string[] = [];
    for (const w of WALLS) for (const dir of [1, -1]) for (const v of [13, 34]) for (const gap of [3, 8, 15, 22]) {
      const d = { x: -w.out.z * dir, z: w.out.x * dir }, yaw = Math.atan2(-d.x, -d.z), c = { x: w.centre.x - w.out.x * gap, z: w.centre.z - w.out.z * gap };
      const start = { x: c.x - d.x * 60, y: 60, z: c.z - d.z * 60 };
      const runs = [false, true].map(steerOff => {
        const s = new Sim(start, { city: false }), h = heading(yaw, 0), m = thumb(v); s.yaw = yaw; s.pitch = 0; s.v = { x: h.x * v, y: 0, z: h.z * v }; s.setModel(m);
        for (let i = 0; i < 3 / DT; i++) s.step(m, { steerOff });
        const r = { yaw: s.yaw, pitch: s.pitch, p: { ...s.p } }; s.free(); return r;
      });
      const dy = Math.abs(runs[1].yaw - runs[0].yaw), dp = Math.hypot(runs[1].p.x - runs[0].p.x, runs[1].p.z - runs[0].p.z);
      if (dy > 1e-9 || dp > 1e-6) bad.push(`${w.id} ${dir > 0 ? '+' : '-'} ${v} m/s at ${gap} m: yaw moved ${dy.toFixed(3)} rad, path ${dp.toFixed(2)} m off`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('a suit already moving away from the edge is left alone', () => {
    const w = WALLS[0], s = wallEntry(w, 0, 13, 20), m = thumb(13); s.yaw += Math.PI - .6; s.setModel(m); const y0 = s.yaw;
    for (let i = 0; i < 2 / DT; i++) s.step(m);
    expect(Math.abs(s.yaw - y0)).toBeLessThan(1e-9); s.free();
  });
});

describe('backing away is the pilot answer', () => {
  const faces: { id: string; make: (v: number) => Sim; dist: (s: Sim) => number }[] = [
    ...WALLS.map(w => ({ id: `wall ${w.id}`, make: (v: number) => wallEntry(w, 0, v, 36), dist: (s: Sim) => w.dist(s.p) })),
    ...[['ceiling', .7, (s: Sim) => WORLD.ceiling - s.p.y, WORLD.ceiling - 60], ['floor', -.7, (s: Sim) => s.p.y - FLOOR, FLOOR + 60]].map(([id, pitch, dist, y0]) => ({ id: id as string, dist: dist as (s: Sim) => number,
      make: (v: number) => { const h = heading(0, pitch as number), s = new Sim({ x: 0, y: y0 as number, z: 60 }, { city: false }); s.yaw = 0; s.pitch = pitch as number; s.v = { x: h.x * v, y: h.y * v, z: h.z * v }; return s; } })),
  ];
  /** Fly W into the limit with steering off until the suit is pinned against it, then hold S: seconds to 12 m out, and how far the view turned. */
  function backOut(f: typeof faces[number], v: number, steerOff: boolean) {
    const s = f.make(v), fwd = keys(['KeyW'], v > 20), back = keys(['KeyS'], v > 20); s.setModel(fwd);
    for (let i = 0; i < 12 / DT && !(f.dist(s) < 1.8 && s.speed < 1); i++) s.step(fwd, { steerOff: true });
    const y0 = s.yaw, p0 = s.pitch, d0 = f.dist(s), t0 = s.t; s.setModel(back); let out: number | null = null;
    for (let i = 0; i < 6 / DT; i++) { s.step(back, { steerOff }); if (f.dist(s) - d0 > 10.8 && s.speed > 2) { out = s.t - t0; break; } }
    const r = { t: out, dy: Math.abs(s.yaw - y0), dp: Math.abs(s.pitch - p0), pinned: d0 < 1.8 }; s.free(); return r;
  }
  it('S held while pinned at every wall, the sky and the water: as fast out as with steering off (+0.1 s), and the view never turns', () => {
    const bad: string[] = [];
    for (const f of faces) for (const v of [13, 34]) {
      const off = backOut(f, v, true), on = backOut(f, v, false);
      if (!off.pinned) { bad.push(`${f.id} ${v} m/s: the set-up never pinned`); continue; }
      if (on.t === null || off.t === null || on.t > off.t + .1) bad.push(`${f.id} ${v} m/s: out after ${on.t?.toFixed(2) ?? 'never'} s, ${off.t?.toFixed(2) ?? 'never'} s with steering off`);
      if (on.dy > 1e-9 || on.dp > 1e-9) bad.push(`${f.id} ${v} m/s: the nudge turned the view while backing away (yaw ${on.dy.toFixed(2)}, pitch ${on.dp.toFixed(2)})`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('the view is the pilot\'s', () => {
  const pinned = () => { const s = wallEntry(WALLS[0], .5, 13, 10); return s; };
  it.each([1, 2, -1])('a %s rad/s slide-look turn at a wall goes exactly where the pilot turns it', rate => {
    const s = pinned(), y0 = s.yaw, m: Model = { ...thumb(13), look: rate }; s.setModel(m);
    for (let i = 0; i < 4 / DT; i++) s.step(m);
    expect(Math.abs(s.yaw - (y0 + 4 * rate)), `ended ${(s.yaw - y0).toFixed(2)} rad, the pilot asked ${4 * rate}`).toBeLessThan(.05); s.free();
  });
  it('a held trigger keeps the view: no yaw or pitch nudge while aiming or firing at a wall, the sky or the water', () => {
    const s = pinned(), y0 = s.yaw, m = thumb(13); s.aiming = true; s.setModel(m);
    for (let i = 0; i < 4 / DT; i++) s.step(m);
    expect(s.yaw).toBe(y0); s.free();
    const t = new Sim({ x: 0, y: WORLD.ceiling - 2, z: 60 }, { city: false }); t.aiming = true; t.pitch = .8; t.yaw = 0; t.v = { x: 0, y: 8, z: -8 }; t.setModel(m);
    for (let i = 0; i < 3 / DT; i++) t.step(m);
    expect(t.pitch).toBe(.8); t.free();
  });
  it('twin-touch level flight: the aim pitch is never peeled at the water or the sky, and never faced at a wall', () => {
    for (const [y, pitch] of [[FLOOR + .6, -.12], [WORLD.ceiling - .6, .3]] as const) {
      const s = new Sim({ x: 0, y, z: 60 }, { city: false }), m = thumb(13); s.level = true; s.pitch = pitch; s.yaw = 0; s.setModel(m);
      for (let i = 0; i < 3 / DT; i++) s.step(m);
      expect(s.pitch, `pitch at y ${y}`).toBe(pitch); s.free();
    }
    const w = WALLS[0], s = wallEntry(w, .5, 13, 10), m = thumb(13); s.level = true; s.pitch = .4; s.setModel(m);
    for (let i = 0; i < 3 / DT; i++) s.step(m);
    expect(s.pitch).toBe(.4); s.free();
  });
  it('hands-off with the pitch flying the suit, a dive at the floor is still levelled (the fix is scoped to level flight)', () => {
    const s = new Sim({ x: 0, y: FLOOR + 5, z: 60 }, { city: false }), m = thumb(13); s.pitch = -.8; s.yaw = 0; s.v = { x: 0, y: -9, z: -9 }; s.setModel(m);
    for (let i = 0; i < 3 / DT; i++) s.step(m);
    expect(s.pitch).toBeGreaterThan(-.35); s.free();
  });
});

describe('a resting thumb is not a turn', () => {
  it.each([.24, -.24])('a thumb parked in the edge zone (turn %s) at a wall still gets the suit out inside the budget', edge => {
    const bad: string[] = [];
    for (const w of WALLS) for (const v of [8, 34]) {
      const s = wallEntry(w, 0, v, 36), b = BUDGET.wall(v) + 1;
      const f = fly(s, thumb(v, edge), { metric: q => w.dist(q.p), contact: 1.6, arm: 30, clear: CLEAR.wall, cap: b + 2 });
      if (f.escapeAfter === null || f.escapeAfter > b) bad.push(`${w.id} ${v} m/s: ${f.escapeAfter?.toFixed(2) ?? 'no escape'} s (budget ${b})`); s.free();
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('latches are dropped when flight stops', () => {
  const at = (x: number, y: number, z: number) => ({ x, y, z });
  it('a peel in progress does not survive a landing, a reset or a hover: the next take-off starts clean', () => {
    const rt = { yaw: 0, pitch: .8 }, base = { dt: DT, p: at(0, WORLD.ceiling - .6, 0), v: at(0, 20, -20), speed: 0, commanded: 34, target: at(0, 24, -24),
      contact: { active: false, normal: at(0, -1, 0) }, scrape: { active: false, normal: at(0, 1, 0) }, pitchFlies: true, aiming: false };
    resetLimitSteer(); limitSteer(rt, base);
    expect(peeling()).toBe(1);
    idleLimitSteer(); expect(peeling()).toBe(0);
    // Take off from the ground level, pitched at -0.12: nothing drives the pitch.
    const ground = { ...base, p: at(0, 12, 0), v: at(0, 0, 0), commanded: 13, target: at(0, -1.5, -12.9) }, r2 = { yaw: 0, pitch: -.12 };
    for (let i = 0; i < 30; i++) limitSteer(r2, ground);
    expect(r2.pitch).toBe(-.12); expect(r2.yaw).toBe(0);
    resetLimitSteer();
  });
});
