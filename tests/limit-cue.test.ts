// S3 invariant: the cue for a limit appears at least 2.0 s before the suit reaches it (today 0.53 s at 34 m/s, none at all at the
// floor). Hands-off head-on runs from 60+ m out at 8 / 13 / 34 m/s. The cue is harness.cue(): the same expression Player.tsx uses.
// "Reaches it" = the moment the clearance to the surface stops shrinking; a run that never gets within 4 m needs no cue.
import { beforeAll, describe, expect, it } from 'vitest';
import { init, Sim, DT, WORLD, cue } from './lim/harness';
import { CLIFFS, FLOOR, WALLS, cliffSim, heading, report, solidDist, thumb, wallEntry, type Metric } from './lim/drive';
beforeAll(init);
const LEAD = 2.0;
const FLOOR_LEAD = 2.3;   // the review measured 1.77 s from the water cue to contact at cruise
function watch(s: Sim, v: number, metric: Metric, kind: 'edge' | 'solid') {
  const m = thumb(v); s.setModel(m);
  let cueAt: number | null = null, dmin = Infinity, tMin = 0;
  for (let i = 0; i < 30 / DT; i++) {
    s.step(m); const d = metric(s);
    if (d < dmin - .05) { dmin = d; tMin = s.t; }
    if (cueAt === null && cue(s, kind)) cueAt = s.t;
    if (dmin <= 4 && s.t - tMin > 1) break;   // it has reached the limit (or turned away); nothing later can be the cue for it
  }
  s.free(); return { cueAt, dmin, tMin };
}
const verdict = (id: string, r: ReturnType<typeof watch>) => r.dmin > 4 ? null
  : r.cueAt === null ? `${id}: cue never shown before reaching the limit`
  : r.tMin - r.cueAt < LEAD ? `${id}: cue only ${(r.tMin - r.cueAt).toFixed(2)}s before reaching the limit (need ${LEAD}s)` : null;
const vertical = (up: boolean, v: number) => {
  const pitch = up ? .8 : -.8, h = heading(0, pitch), s = new Sim({ x: 0, y: up ? WORLD.ceiling - 50 : FLOOR + 50, z: 60 }, { city: false });
  s.yaw = 0; s.pitch = pitch; s.v = { x: h.x * v, y: h.y * v, z: h.z * v }; return s;
};
describe('the cue arrives early enough to act', () => {
  it(`walls: the edge cue shows at least ${LEAD} s before the stop at every speed`, () => {
    const bad: string[] = [];
    for (const w of WALLS) for (const v of [8, 13, 34]) { const m = verdict(`wall ${w.id} ${v} m/s`, watch(wallEntry(w, 0, v, 60), v, q => w.dist(q.p), 'edge')); if (m) bad.push(m); }
    expect(bad.length, report(bad)).toBe(0);
  });
  it(`sky limit and water floor: a cue shows at least ${LEAD} s before the stop (the floor has no cue today)`, () => {
    const bad: string[] = [];
    for (const v of [8, 13, 34]) {
      const c = verdict(`ceiling ${v} m/s`, watch(vertical(true, v), v, q => WORLD.ceiling - q.p.y, 'edge')); if (c) bad.push(c);
      const f = verdict(`floor ${v} m/s`, watch(vertical(false, v), v, q => q.p.y - FLOOR, 'edge')); if (f) bad.push(f);
    }
    expect(bad.length, report(bad)).toBe(0);
  });
  it(`hill and facade faces: the solid cue shows at least ${LEAD} s before the stop`, () => {
    const bad: string[] = [];
    for (const c of CLIFFS.filter(x => x.id.includes('face head-on'))) for (const v of [8, 13, 34]) {
      const m = verdict(`${c.id} ${v} m/s`, watch(cliffSim(c, v), v, q => solidDist(q, q.p), 'solid')); if (m) bad.push(m);
    }
    expect(bad.length, report(bad)).toBe(0);
  });
  it(`water: from the cue to contact (0.8 m over the flying floor) is at least ${FLOOR_LEAD} s at every pitch and speed that reaches it`, () => {
    // Limits review F14: 1.77 s live at cruise. Contact, not the stop: the peel and the soft limiter both stretch the stop.
    const bad: string[] = [];
    for (const pitch of [-.12, -.3, -.5, -.8]) for (const v of [8, 13, 34]) {
      // From the south end of the box, so the shallowest glide meets the water before it meets the north wall (from z 60 in the
      // 2026-10-06 box the two arrived together, and the wall cue, rightly, took the screen).
      const s = new Sim({ x: 0, y: FLOOR + 60, z: WORLD.maxZ - 10 }, { city: false }), m = thumb(v); s.yaw = 0; s.pitch = pitch; s.setModel(m);
      let cueAt: number | null = null, contact: number | null = null;
      for (let i = 0; i < 40 / DT; i++) { s.step(m); if (cueAt === null && s.cueNow === 'floor') cueAt = s.t; if (s.p.y - FLOOR < .8) { contact = s.t; break; } }
      if (contact !== null && (cueAt === null || contact - cueAt < FLOOR_LEAD)) bad.push(`floor pitch ${pitch} ${v} m/s: cue ${cueAt === null ? 'never' : (contact - cueAt).toFixed(2) + ' s'} before contact (need ${FLOOR_LEAD})`);
      s.free();
    }
    expect(bad.length, report(bad)).toBe(0);
  });
});
