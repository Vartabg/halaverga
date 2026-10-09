// S9 (3)(4)(5): what must NOT change, and the fuzz. Green before the limit fixes and green after.
//  - open air is untouched: a scripted flight far from every limit reproduces the baseline recorded at 67d61d2 to 1e-9;
//  - a pilot who turns on purpose at a limit is never slower than today (baseline table + 0.1 s), either direction;
//  - hands-off flights across the whole city never leave clear space (no "Suit restored" teleport), and never stall for 0.5 s.
// Baselines are tests/fixtures/limit-baseline.json. Re-record ONLY where open-air feel is meant to change:
//   LIMITS_RECORD=1 pnpm vitest run tests/limit-invariants.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { init, Sim, DT, WORLD, type Model } from './lim/harness';
import { WALLS, boxDist, fly, keysFwd, report, thumb, wallEntry } from './lim/drive';
beforeAll(init);
const FILE = new URL('./fixtures/limit-baseline.json', import.meta.url), RECORD = !!process.env.LIMITS_RECORD;
type Base = { openAir: number[][][]; turns: Record<string, number | null> };
const base: Base = RECORD ? { openAir: [], turns: {} } : JSON.parse(readFileSync(FILE, 'utf8'));
const cursor = (v: number, e = 0, pe = 0): Model => ({ kind: 'cursor', throttle: v / 34, edgeTurn: e, edgePitch: pe });

// Open air: city off, start mid-air 148+ m from every wall and 45+ m from floor and ceiling (the nudge zone is at most 25.5 m).
const SCRIPTS: [string, [Model, number][]][] = [
  ['thumb 13 m/s: edge turn right, straight, left, then pitch up', [[thumb(13, 1), 1.5], [thumb(13), 1], [thumb(13, -1), 1.5], [thumb(13, 0, 1), .5], [thumb(13), 1]]],
  ['thumb 34 m/s surge: hard edge turn then straight', [[thumb(34, -1), 2], [thumb(34), 1]]],
  ['cursor cruise 8 -> 34: fast edge turn (carve), release, pitch down', [[cursor(8, 1), 1.2], [cursor(8), 1], [cursor(34, 0, -1), .6], [cursor(34), 1]]],
  ['keys: W+D at 13 m/s, release and coast, surge W', [[keysFwd(13), 0], [{ kind: 'keys', keys: ['KeyW', 'KeyD'] }, 2], [{ kind: 'idle' }, 1.5], [keysFwd(34), 1.5]]],
];
function openAir(): number[][][] {
  return SCRIPTS.map(([, parts]) => {
    const s = new Sim({ x: 0, y: 60, z: -40 }, { city: false }), out: number[][] = []; let i = 0;
    for (const [m, sec] of parts) { s.setModel(m); for (let k = 0; k < Math.round(sec / DT); k++, i++) {
      s.step(m); if (boxDist(s.p) < 26) throw new Error('open-air script strayed into a nudge zone');
      if (i % 6 === 0) out.push([s.p.x, s.p.y, s.p.z, s.yaw, s.pitch, s.v.x, s.v.y, s.v.z]);
    } }
    s.free(); return out;
  });
}
// The pilot's own turn: hands full-forward from the wall face at entry speed, edge hold starts 0.4 s after contact, held for 180 deg.
const turnKey = (w: string, a: number, v: number, sign: number) => `${w} ${a}deg ${v} m/s hold ${sign > 0 ? '+' : '-'}`;
function pilotTurn(wi: number, a: number, v: number, sign: number): number | null {
  const w = WALLS[wi], s = wallEntry(w, a * Math.PI / 180, v, .15), on = thumb(v, sign), off = thumb(v); let y0: number | null = null;
  const f = fly(s, off, { metric: q => w.dist(q.p), contact: 1.6, arm: 30, clear: 12, cap: 25, script: (q, since) => {
    if (since < .4) return null; y0 ??= q.yaw; return Math.abs(q.yaw - y0) >= Math.PI ? off : on;
  } });
  s.free(); return f.escapeAfter === null ? null : +f.escapeAfter.toFixed(4);
}
const TURNS: [number, number, number, number][] = [];
for (const wi of [0, 1, 2, 3]) for (const a of [0, 45, 75]) for (const v of [8, 13, 34]) for (const sign of [1, -1]) TURNS.push([wi, a, v, sign]);

describe('what must not change', () => {
  it('open air: the scripted flights reproduce the 67d61d2 trajectory (position, yaw, pitch, velocity) to 1e-9', () => {
    const now = openAir();
    if (RECORD) { base.openAir = now; return; }
    let worst = 0, bad = '';
    now.forEach((run, r) => { expect(run.length, SCRIPTS[r][0]).toBe(base.openAir[r].length);
      run.forEach((row, i) => row.forEach((x, j) => { const d = Math.abs(x - base.openAir[r][i][j]); if (d > worst) { worst = d; bad = `${SCRIPTS[r][0]} sample ${i} field ${j}`; } })); });
    expect(worst, `largest deviation ${worst.toExponential(2)} at ${bad}`).toBeLessThan(1e-9);
  });
  it('a pilot who turns on purpose at a limit is never slower than today (+0.1 s), in either direction', () => {
    const bad: string[] = [];
    for (const [wi, a, v, sign] of TURNS) {
      const key = turnKey(WALLS[wi].id, a, v, sign), t = pilotTurn(wi, a, v, sign);
      if (RECORD) { base.turns[key] = t; continue; }
      const was = base.turns[key];
      if (was !== null && (t === null || t > was + .1)) bad.push(`${key}: ${t === null ? 'never clear' : t.toFixed(2) + 's'} vs ${was.toFixed(2)}s at 67d61d2`);
    }
    if (RECORD) writeFileSync(FILE, JSON.stringify(base));
    expect(Object.keys(base.turns)).toHaveLength(TURNS.length);
    expect(bad.length, report(bad)).toBe(0);
  });
});

// Fuzz: hands-off flights from random free points across the whole city, real walls and buildings. Seeded, so it is repeatable.
describe('fuzz: 250 hands-off flights', () => {
  const N = 250, SECONDS = 24;
  const runs = () => {
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const probe = new Sim({ x: 0, y: 70, z: 0 }), ball = new RAPIER.Ball(2.2), out: { id: string; tele: number; stall: number }[] = [];
    for (let n = 0; n < N; n++) {
      let p: { x: number; y: number; z: number }, tries = 0;
      // The whole box since 2026-10-06 (the district and the flyable ruins around it), 3 m in from each face.
      do { p = { x: WORLD.minX + 3 + rnd() * (WORLD.maxX - WORLD.minX - 6), y: 4 + rnd() * (WORLD.ceiling - 7), z: WORLD.minZ + 3 + rnd() * (WORLD.maxZ - WORLD.minZ - 6) }; tries++; }
      while (probe.world.intersectionWithShape(p, { x: 0, y: 0, z: 0, w: 1 }, ball, undefined, undefined, probe.col) && tries < 200);
      const v = rnd() < .5 ? 13 : 34, s = new Sim(p); s.yaw = rnd() * Math.PI * 2; s.pitch = Math.max(-1.3, Math.min(1.25, (rnd() - .5) * 2.4));
      const f = fly(s, thumb(v), { metric: q => boxDist(q.p), contact: -1, clear: 1e9, cap: SECONDS, maxTotal: SECONDS });
      out.push({ id: `flight ${n} from ${[p.x, p.y, p.z].map(Math.round)} ${v} m/s yaw ${s.yaw.toFixed(2)}`, tele: f.teleports, stall: f.peakStall }); s.free();
    }
    probe.free(); return out;
  };
  let results: ReturnType<typeof runs> = [];
  beforeAll(() => { results = runs(); }, 120000);
  it('no flight ever leaves clear space (the "Suit restored" teleport never fires)', () => {
    const bad = results.filter(r => r.tele > 0).map(r => `${r.id}: isClear failed ${r.tele}x`);
    expect(bad.length, report(bad)).toBe(0);
  });
  it('no flight stalls (speed under 0.6 m/s) for 0.5 s or more', () => {
    const bad = results.filter(r => r.stall >= .5).map(r => `${r.id}: stalled ${r.stall.toFixed(1)}s`);
    expect(bad.length, report(bad)).toBe(0);
  });
});
