// Scenario helpers for the limit invariants (tests/limit-*.test.ts): flight driver, clearance metrics, budgets, wall geometry.
import { Sim, DT, WORLD, type Model } from './harness';
export type V3 = { x: number; y: number; z: number };
export const FLOOR = 1.7, CRUISE = 8, HOVER = 13, SURGE = 34;
export const boxDist = (p: V3) => Math.min(p.x - WORLD.minX, WORLD.maxX - p.x, p.z - WORLD.minZ, WORLD.maxZ - p.z, WORLD.ceiling - p.y, p.y - FLOOR);
/** Distance to the district faces a recorded pin sits against (within 1.9 m at the start: touching): a suit that clears its corner is out, even
 *  if it flies level 8 m under a ceiling it never touched. Walls, ceiling and floor. */
export function pinnedBoxDist(p0: V3): Metric {
  const all: ((p: V3) => number)[] = [(p: V3) => p.x - WORLD.minX, (p: V3) => WORLD.maxX - p.x, (p: V3) => p.z - WORLD.minZ, (p: V3) => WORLD.maxZ - p.z, (p: V3) => WORLD.ceiling - p.y, (p: V3) => p.y - FLOOR];
  const faces = all.filter(f => f(p0) <= 1.9);
  return s => Math.min(...faces.map(f => f(s.p)));
}
export const thumb = (v: number, e = 0, pe = 0): Model => ({ kind: 'thumb', forward: v / SURGE, edgeTurn: e, edgePitch: pe });
export const keysFwd = (v: number): Model => ({ kind: 'keys', keys: ['KeyW'], surge: v > 20 });
export const heading = (yaw: number, pitch: number): V3 => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
/** Plan numbers (limits-plan S1, S5, S6): seconds from first contact to clear of the surface, hands-off. */
export const BUDGET = {
  wall: (v: number) => v <= 8.5 ? 4.5 : v <= 13.5 ? 3.5 : 2.6,
  vertical: (v: number) => v <= 13.5 ? 4 : 2,
  // 20 m from a face at 8 m/s is 2.5 s of straight flight after a turn of about 150 degrees: the plan's 3.5 s cannot be met at cruise.
  cliff: (v: number) => v <= 8.5 ? 5 : v <= 13.5 ? 3.5 : 2.5,
  // Diving into the 6.4 m slot between the hill face and the +X wall: the way out is up and over, not away.
  slot: (v: number) => v <= 8.5 ? 9 : v <= 13.5 ? 6.5 : 4,
};
export const CLEAR = { wall: 12, vertical: 12, cliff: 20 };
/** Rapier interaction groups that see the city solids but not the invisible boundary (BOUNDARY_GROUPS = 0x0002ffff). */
const CITY_ONLY = 0x0001fffd;
export function solidDist(s: Sim, p: V3): number {
  const h = s.world.projectPoint(p, false, undefined, CITY_ONLY, s.col);
  return h ? Math.hypot(h.point.x - p.x, h.point.y - p.y, h.point.z - p.z) : Infinity;
}
export type Metric = (s: Sim) => number;
/**
 * Distance to the ONE solid the suit is pinned against: it locks onto the nearest city collider the first time the suit is within
 * 3 m of one (at once for a recorded pin), then measures only that collider. The old metric was the nearest of all solids, which in
 * this dense district never reaches 20 m: a suit leaving one hill at y = 25 stays 9.5 m over the terrace beside it.
 */
export function faceDist(): Metric {
  let target: import('@dimforge/rapier3d-compat').Collider | null = null;
  return s => {
    if (!target) {
      const h = s.world.projectPoint(s.p, false, undefined, CITY_ONLY, s.col);
      if (!h) return Infinity;
      const d = Math.hypot(h.point.x - s.p.x, h.point.y - s.p.y, h.point.z - s.p.z);
      if (d > 3) return d;
      target = h.collider;
    }
    const q = target.projectPoint(s.p, false);
    return q ? Math.hypot(q.point.x - s.p.x, q.point.y - s.p.y, q.point.z - s.p.z) : Infinity;
  };
}
export interface FlyOpts {
  metric: Metric;             // clearance: larger is safer
  contact: number;            // metric at or below this = the suit has reached the limit (clock starts)
  arm?: number;               // escape only counts once the metric has been at or below this (default: contact); a suit turned away
                              // before it touches (escape with no contact) then reports 0 s
  clear: number;              // metric at or above this, moving away faster than 2 m/s = escaped
  cap: number;                // stop this many seconds after contact
  steerOff?: boolean;
  maxTotal?: number;          // absolute cap, seconds (default 40)
  script?: (s: Sim, sinceContact: number) => Model | null;   // pilot input after contact
  each?: (s: Sim, i: number, d: number, t0: number | null) => void;
}
export interface Flight {
  contactAt: number | null; escapeAfter: number | null; peakStall: number; teleports: number;
  minDist: number; end: V3; endSpeed: number; endPitch: number; steps: number;
}
const prev0 = (o: FlyOpts, s: Sim) => o.metric(s) <= (o.arm ?? o.contact);
export function fly(s: Sim, model: Model, o: FlyOpts): Flight {
  s.setModel(model);
  let m = model, armed = prev0(o, s), t0: number | null = null, prev = o.metric(s), min = prev, run = 0, peak = 0, tele = 0, esc: number | null = null, n = 0;
  const total = Math.round((o.maxTotal ?? 40) / DT);
  for (let i = 0; i < total; i++, n++) {
    if (o.script && t0 !== null) { const next = o.script(s, s.t - t0); if (next && next !== m) { m = next; s.setModel(m); } }
    s.step(m, { steerOff: o.steerOff });
    if (!s.safe.isClear(s.body.translation())) tele++;
    const d = o.metric(s); min = Math.min(min, d);
    if (t0 === null && d <= o.contact) t0 = s.t;
    if (d <= (o.arm ?? o.contact)) armed = true;
    if (s.t > .5 && s.speed < .6) { run++; peak = Math.max(peak, run * DT); } else run = 0;
    const rate = (d - prev) / DT; prev = d;
    o.each?.(s, i, d, t0);
    if (armed && d >= o.clear && rate > 2) { esc = s.t - (t0 ?? s.t); break; }
    if (t0 !== null && s.t - t0 > o.cap) break;
  }
  return { contactAt: t0, escapeAfter: esc, peakStall: peak, teleports: tele, minDist: min, end: { ...s.p }, endSpeed: s.speed, endPitch: s.pitch, steps: n };
}
/** The four district walls: outward normal, the yaw that flies straight into it, distance to it, and the wall centre. */
export interface Wall { id: string; yaw0: number; out: V3; dist: (p: V3) => number; centre: V3 }
export const WALLS: Wall[] = [
  { id: '+X', yaw0: -Math.PI / 2, out: { x: 1, y: 0, z: 0 }, dist: p => WORLD.maxX - p.x, centre: { x: WORLD.maxX, y: 70, z: -40 } },
  { id: '-X', yaw0: Math.PI / 2, out: { x: -1, y: 0, z: 0 }, dist: p => p.x - WORLD.minX, centre: { x: WORLD.minX, y: 70, z: -40 } },
  { id: '-Z', yaw0: 0, out: { x: 0, y: 0, z: -1 }, dist: p => p.z - WORLD.minZ, centre: { x: 0, y: 70, z: WORLD.minZ } },
  { id: '+Z', yaw0: Math.PI, out: { x: 0, y: 0, z: 1 }, dist: p => WORLD.maxZ - p.z, centre: { x: 0, y: 70, z: WORLD.maxZ } },
];
export const STOP_GAP = 1.14;   // where the suit stops short of a wall today (probe at the invisible collider face); S2 keeps it
/** A suit `along` metres (measured along the wall normal) before the wall centre, `ang` rad off the normal, moving at `v` m/s. */
export function wallEntry(w: Wall, ang: number, v: number, along: number, opts: { city?: boolean } = {}): Sim {
  const yaw = w.yaw0 + ang, h = heading(yaw, 0), k = along / Math.cos(ang);
  const c = { x: w.centre.x - w.out.x * STOP_GAP, y: w.centre.y, z: w.centre.z - w.out.z * STOP_GAP };
  const s = new Sim({ x: c.x - h.x * k, y: c.y, z: c.z - h.z * k }, { city: opts.city ?? false });
  s.yaw = yaw; s.pitch = 0; s.v = { x: h.x * v, y: 0, z: h.z * v };
  return s;
}
/** First lines of a failure list plus a tally of what kind of trap each one is. */
export function report(bad: string[]): string {
  const kind = (b: string) => /isClear/.test(b) ? 'teleport' : /peak closing/.test(b) ? 'brakes too hard' : /67d61d2/.test(b) ? 'pilot turn slower than today' : /cue/.test(b) ? 'cue too late' : /stalled [1-9]|stalled 0\.[5-9]/.test(b) ? 'pinned (speed 0)' : /never reached/.test(b) ? 'never reached the limit' : /no escape/.test(b) ? 'sliding along the surface, never clear' : /budget/.test(b) ? 'escapes, too slow' : 'other';
  const tally: Record<string, number> = {}; for (const b of bad) tally[kind(b)] = (tally[kind(b)] ?? 0) + 1;
  return `${bad.length} failures ${JSON.stringify(tally)}:\n  ${bad.slice(0, 10).join('\n  ')}${bad.length > 10 ? `\n  ... ${bad.length - 10} more` : ''}`;
}
export const fmt = (id: string, b: number, f: Flight) => f.teleports ? `${id}: isClear failed ${f.teleports}x (Suit restored would fire)`
  : f.escapeAfter === null ? `${id}: no escape ${f.contactAt === null ? 'and never reached the limit' : `${b}s after contact`} (stalled ${f.peakStall.toFixed(1)}s, ended ${f.endSpeed.toFixed(1)} m/s, min clearance ${f.minDist.toFixed(1)})`
  : `${id}: escaped after ${f.escapeAfter.toFixed(2)}s, budget ${b}s`;
export const late = (f: Flight, b: number) => f.teleports > 0 || f.escapeAfter === null || f.escapeAfter > b;
/** Named hill / slot cases from the browser report (cliff faces at x = +/-157 and +/-112, the slot beside the +X wall). */
export interface Cliff { id: string; p: V3; yaw: number; pitch: number; slot?: boolean }
const R = (d: number) => d * Math.PI / 180;
export const CLIFFS: Cliff[] = [
  { id: 'east hill face head-on y25', p: { x: 60, y: 25, z: 60.7 }, yaw: -R(90), pitch: 0 },
  { id: 'west hill face head-on y25', p: { x: -60, y: 25, z: 60.7 }, yaw: R(90), pitch: 0 },
  { id: 'east low hill face head-on y8', p: { x: 40, y: 8, z: 65 }, yaw: -R(90), pitch: 0 },
  // A slow scrape: 20 deg off head-on keeps 34% of the commanded speed along the face (the browser report's 3.5 m/s at cruise).
  { id: 'east hill scrape 20deg off head-on y25', p: { x: 100, y: 25, z: 60 }, yaw: -R(70), pitch: 0 },
  { id: 'west hill scrape 20deg off head-on y25', p: { x: -100, y: 25, z: 60 }, yaw: R(70), pitch: 0 },
  { id: 'hill and perimeter slot (dive)', p: { x: 185, y: 40, z: -36 }, yaw: -R(90), pitch: -.3, slot: true },
];
/** A cliff run's clearance: nearest city solid, or (slot) also the district faces. */
export const cliffMetric = (c: Cliff): Metric => { const face = faceDist(); return c.slot ? q => Math.min(boxDist(q.p), face(q)) : face; };
export function cliffSim(c: Cliff, v: number): Sim {
  const s = new Sim(c.p), h = heading(c.yaw, c.pitch);
  s.yaw = c.yaw; s.pitch = c.pitch; s.v = { x: h.x * v, y: h.y * v, z: h.z * v };
  return s;
}
