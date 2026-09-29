// S2 invariants: the stop at a limit is one soft ramp, and it stops where it stops today.
//  - closing deceleration never exceeds 30 m/s2 (today 105-152, nominal 65), against all six limits;
//  - the stop point is unchanged (1.14 m short of a wall) so no new penetration cases open up;
//  - the suit never leaves clear space (FlightSafety.isClear), i.e. "Suit restored" can never fire.
// Steering is off for these runs (opts.steerOff) so they measure the limiter alone, like the old tests/lim/brake.test.ts did.
import { beforeAll, describe, expect, it } from 'vitest';
import { init, Sim, DT, WORLD } from './lim/harness';
import { CLIFFS, FLOOR, STOP_GAP, WALLS, cliffSim, heading, report, thumb, wallEntry, type V3 } from './lim/drive';
beforeAll(init);
const MAX_DECEL = 30, TOL = .05;
interface Case { id: string; make: () => Sim; out: V3; gap: (s: Sim) => number; v: number }
const cases: Case[] = [];
for (const v of [8, 13, 34]) {
  for (const w of WALLS) for (const a of [0, Math.PI / 4]) cases.push({ id: `wall ${w.id} ${Math.round(a * 57.3)}deg ${v} m/s`, make: () => wallEntry(w, a, v, 36), out: w.out, gap: s => w.dist(s.p), v });
  for (const [id, pitch, out, gap] of [['ceiling', .8, { x: 0, y: 1, z: 0 }, (s: Sim) => WORLD.ceiling - s.p.y], ['floor', -.8, { x: 0, y: -1, z: 0 }, (s: Sim) => s.p.y - FLOOR]] as const)
    cases.push({ id: `${id} ${v} m/s`, out, gap, v, make: () => {
      const h = heading(0, pitch), s = new Sim({ x: 0, y: id === 'ceiling' ? 70 : 40, z: 60 }, { city: false });
      s.yaw = 0; s.pitch = pitch; s.v = { x: h.x * v, y: h.y * v, z: h.z * v }; return s;
    } });
}
/** Run one approach with steering off. Closing speed = velocity along the outward normal; peak = largest one-frame drop of it, the last step to a stop included. */
function approach(c: Case, seconds = 12, steerOff = true) {
  const s = c.make(), m = thumb(c.v); s.setModel(m);
  let prev = s.v.x * c.out.x + s.v.y * c.out.y + s.v.z * c.out.z, peak = 0, tele = 0, calm = 0;
  for (let i = 0; i < seconds / DT; i++) {
    s.step(m, { steerOff });
    const closing = s.v.x * c.out.x + s.v.y * c.out.y + s.v.z * c.out.z;
    if (prev > .05) peak = Math.max(peak, (prev - closing) / DT);
    prev = closing; if (!s.safe.isClear(s.body.translation())) tele++;
    calm = s.speed < .05 ? calm + 1 : 0; if (calm > 30) break;
  }
  const out = { peak, tele, stopGap: c.gap(s), stopped: calm > 30, speed: s.speed }; s.free(); return out;
}
describe('one soft limiter', () => {
  it('peak closing deceleration at every limit is at most 30 m/s2', () => {
    const bad: string[] = [];
    for (const c of cases) { const r = approach(c); if (r.peak > MAX_DECEL + TOL) bad.push(`${c.id}: peak closing decel ${r.peak.toFixed(0)} m/s2 (max ${MAX_DECEL})`); }
    expect(bad.length, report(bad)).toBe(0);
  });
  it('with the heading nudge on, the closing speed still never falls faster than 30 m/s2 (a surge stop that turns away used to peak at 38-42)', () => {
    // Limits review F12: the nudge re-aims the thrust outward during the last metre of the ramp; the velocity blend added up to 40 m/s2
    // on top of the limiter's 30. paceClosing holds the ramp against it. Every wall, every speed, angles up to 0.7 rad off the normal (a shallower slide is a plain swerve, no ramp), steering ON, last step included.
    const bad: string[] = [];
    for (const v of [8, 13, 34]) for (const w of WALLS) for (const a of [0, .15, .3, .5, .7]) {
      const c: Case = { id: `wall ${w.id} ${a} rad ${v} m/s`, make: () => wallEntry(w, a, v, 36), out: w.out, gap: s => w.dist(s.p), v }, r = approach(c, 8, false);
      if (r.peak > MAX_DECEL + TOL) bad.push(`${c.id}: peak closing decel ${r.peak.toFixed(0)} m/s2 (max ${MAX_DECEL}) with the nudge on`);
    }
    expect(bad.length, report(bad)).toBe(0);
  });
  it('a head-on stop still ends 1.14 m short of the wall (same stop point), stopped, not creeping', () => {
    const bad: string[] = [];
    for (const c of cases.filter(x => x.id.startsWith('wall') && x.id.includes(' 0deg'))) {
      const r = approach(c, 20);
      if (!r.stopped || Math.abs(r.stopGap - STOP_GAP) > .12) bad.push(`${c.id}: ${r.stopped ? 'stopped' : 'still moving at ' + r.speed.toFixed(2) + ' m/s'} ${r.stopGap.toFixed(2)} m from the wall (was ${STOP_GAP})`);
    }
    expect(bad.length, report(bad)).toBe(0);
  });
  it('no limit approach ever leaves clear space (isClear holds, so Suit restored cannot fire)', () => {
    const bad: string[] = [];
    for (const c of cases) { const r = approach(c); if (r.tele) bad.push(`${c.id}: isClear failed ${r.tele}x`); }
    for (const c of CLIFFS) for (const v of [8, 13, 34]) {
      const s = cliffSim(c, v), m = thumb(v); s.setModel(m); let tele = 0;
      for (let i = 0; i < 10 / DT; i++) { s.step(m, { steerOff: true }); if (!s.safe.isClear(s.body.translation())) tele++; }
      if (tele) bad.push(`${c.id} ${v} m/s: isClear failed ${tele}x`); s.free();
    }
    expect(bad.length, report(bad)).toBe(0);
  });
});
