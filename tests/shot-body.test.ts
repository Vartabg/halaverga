import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createShooter, pushEvent, type ShooterState } from '../src/game/combat';
import { advanceWeapon } from '../src/game/weapon';
import { restCannonDrive, type CannonDrive } from '../src/world/cannonContract';
import { advanceShotBody, createShotBody, ventAimScale, type ShotBody, type ShotBodyEnv } from '../src/world/shotBody';
import { flareOf, writeCannonDrive } from '../src/world/shotDrive';
import { CH, CHANNELS, CHANNEL_COUNT, peakTime, springsAtRest } from '../src/world/shotSprings';

const DEG = Math.PI / 180, RATES = [30, 60, 120, 165], EXACT = CHANNELS.map((c, i) => c.exact ? i : -1).filter(i => i >= 0);
type Sim = { s: ShooterState; b: ShotBody; env: ShotBodyEnv; d: CannonDrive; t: number; held: boolean; dt: number };
const drive = (): CannonDrive => { const d = { coreColor: {}, stripColor: {} } as CannonDrive; restCannonDrive(d); return d; };
function sim(hz: number, env: Partial<ShotBodyEnv> = {}): Sim {
  const s = createShooter(), b = createShotBody(), dt = 1 / hz; b.vary = 0;
  const k: Sim = { s, b, d: drive(), t: 0, held: false, dt,
    env: { dt, paused: false, reduced: false, epoch: 1, aimWeight: 1, ads: 0, ground: 1, pxPerM: 0, ...env } };
  advanceShotBody(b, s, k.env);
  return k;
}
/** One render frame: optional press, the weapon (the real shot clock), then the body and the cannon drive. Returns shots fired. */
function frame(k: Sim, press = false) {
  if (press) k.s.input.pressSerial++;
  k.t += k.dt;
  const n = advanceWeapon(k.s.weapon, k.held, k.s.input.pressSerial, k.dt);
  advanceShotBody(k.b, k.s, k.env); writeCannonDrive(k.b, k.s, k.env.aimWeight, k.env.reduced, k.d);
  return n;
}
const out = (k: Sim, c: number) => k.b.springs.x[c] * k.b.m;
/** What the pose shows: the hover channels are weighted by 1 - ground weight. */
const shown = (k: Sim, c: number) => out(k, c) * (c === CH.hoverPitch || c === CH.legTrail ? 1 - k.b.gw : 1);
/** Single press shot on frame 0; records every channel for `seconds`. Times are from the shot. */
function single(hz: number, seconds: number, env: Partial<ShotBodyEnv> = {}) {
  const k = sim(hz, env), rows: number[][] = [], times: number[] = [];
  frame(k, true); rows.push(CHANNELS.map((_, c) => out(k, c))); times.push(0);
  for (let i = 1; i <= Math.round(seconds * hz); i++) { frame(k); rows.push(CHANNELS.map((_, c) => out(k, c))); times.push(i / hz); }
  return { k, rows, times };
}
/** Held fire at 9/s; per shot index, the max of each channel over that shot's period, and the shot's base gain. */
function burst(hz: number, seconds: number) {
  const k = sim(hz); k.held = true;
  const peaks: number[][] = [], gains: number[] = [], trace: number[][] = [];
  frame(k, true);
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    const shots = k.s.weapon.shots;
    if (shots > peaks.length) { peaks.push(new Array(CHANNEL_COUNT).fill(-Infinity)); gains.push(k.b.shotGain); }
    const p = peaks[peaks.length - 1];
    CHANNELS.forEach((_, c) => { p[c] = Math.max(p[c], Math.abs(out(k, c))); });
    trace.push(CHANNELS.map((_, c) => out(k, c)));
    frame(k);
  }
  return { k, peaks, gains, trace };
}

describe('shot springs', () => {
  it('keeps the table rule: 6.5-12 Hz springs have z >= .55, and z < 1 everywhere', () => {
    for (const c of CHANNELS) { expect(c.z).toBeLessThan(1); if (c.f >= 6.5 && c.f <= 12) expect(c.z).toBeGreaterThanOrEqual(.55); }
    // The arm snap channels peak on the shot frame (0 ms); the body channels travel outward in time.
    expect(CHANNELS.map(c => Math.round(peakTime(c) * 1000))).toEqual([0, 0, 0, 0, 0, 74, 99, 111, 101, 185]);
  });
  it('peaks the exact channels on their reference times at 1 +- .05 (single shot, 60 Hz)', () => {
    const { rows, times } = single(60, 1);
    const ref: Record<number, number> = { [CH.torso]: .074, [CH.offArm]: .099, [CH.head]: .111, [CH.hoverPitch]: .101, [CH.legTrail]: .185 };
    for (const c of EXACT) {
      let best = 0; rows.forEach((r, i) => { if (r[c] > rows[best][c]) best = i; });
      expect(Math.abs(times[best] - ref[c])).toBeLessThanOrEqual(1 / 60 + 1e-9);
      expect(Math.abs(rows[best][c] - 1)).toBeLessThanOrEqual(.05);
    }
  });
  it('peaks the arm snap on frame N at every rate (elbow, shoulder, clavicle, slide exactly 1), the core and slide on the same call', () => {
    for (const hz of RATES) {
      const k = sim(hz); frame(k, true);
      for (const c of [CH.elbow, CH.shoulder, CH.clav, CH.slide]) expect(out(k, c)).toBe(1);
      // The core jumps from the aim level (.45) to firing plus flare (about .95) on the shot frame.
      expect(k.d.core).toBeGreaterThan(.9); expect(k.d.slide).toBeGreaterThan(0);
      const n = [CH.elbow, CH.shoulder, CH.clav, CH.slide].map(c => out(k, c)); frame(k);
      [CH.elbow, CH.shoulder, CH.clav, CH.slide].forEach((c, i) => expect(out(k, c)).toBeLessThan(n[i]));
    }
  });
  it('settles each channel below .05 of peak within its limit and reaches exact rest within 3 s', () => {
    const limit = [70, 120, 150, 150, 150, 200, 280, 260, 330, 720];
    const { k, rows, times } = single(60, 3);
    const settle: number[] = [];
    CHANNELS.forEach((_, c) => {
      let last = 0; rows.forEach((r, i) => { if (Math.abs(r[c]) >= .05) last = i + 1; });
      settle.push(Math.round(times[Math.min(last, times.length - 1)] * 1000));
      expect(times[Math.min(last, times.length - 1)] * 1000).toBeLessThanOrEqual(limit[c]);
    });
    console.info('single-shot settle (ms, 60 Hz):', CHANNELS.map((c, i) => `${c.name} ${settle[i]}`).join(', '));
    expect(springsAtRest(k.b.springs)).toBe(true); expect(k.b.B).toBe(0); expect(flareOf(k.b, false)).toBe(0);
    expect(k.b.killK).toBe(0); expect(k.b.flickK).toBe(0);
  });
  it('holds shot-to-shot peaks steady under sustained 9/s fire (shots 10-20) and counter-pushes the 10th shot to .67', () => {
    // A snap lands on the previous shot's residual, which depends on the frame phase of the 111 ms period: <= 8.2% of peak at 60 Hz
    // (about .2 deg of shoulder), up to 15% at 30 Hz.
    const limit: Record<number, number> = { 30: .16, 60: .09, 120: .06, 165: .06 }, worst: string[] = [];
    for (const hz of RATES) {
      const { peaks, gains } = burst(hz, 2.5);
      expect(peaks.length).toBeGreaterThanOrEqual(21);
      for (let c = 0; c < CHANNEL_COUNT; c++) {
        const norm = peaks.slice(10, 21).map((p, i) => p[c] / gains[10 + i]), hi = Math.max(...norm), lo = Math.min(...norm);
        worst.push(`${hz}Hz ${CHANNELS[c].name} ${((hi - lo) / hi * 100).toFixed(1)}%`);
        expect((hi - lo) / hi).toBeLessThanOrEqual(limit[hz]);
      }
      // The counter-push takes the 10th shot's gain to .67 of the first; its snap peak also carries the ninth's small residual.
      if (hz === 60) { expect(Math.abs(gains[9] / gains[0] - .67)).toBeLessThanOrEqual(.03); expect(peaks[9][CH.elbow] / peaks[0][CH.elbow]).toBeLessThanOrEqual(.8); }
    }
    console.info('sustained peak variation:', worst.join(', '));
  });
  it('agrees across 30/60/120/165 Hz on the exact channels within 3% of peak at shared times', () => {
    // Presses at 0, .2 and .4 s (on every rate's frame grid; held fire's second shot depends on the frame length by design).
    const run = (hz: number) => { const k = sim(hz); const m = new Map<number, number[]>(); frame(k, true);
      for (let i = 1; i <= hz * .8; i++) { frame(k, i === hz * .2 || i === hz * .4); if ((i * 15) % hz === 0) m.set(i * 15 / hz, EXACT.map(c => out(k, c))); }
      expect(k.s.weapon.shots).toBe(3); return m; };
    const ref = run(60);
    for (const hz of [30, 120, 165]) for (const [t, row] of run(hz)) row.forEach((v, j) => expect(Math.abs(v - ref.get(t)![j])).toBeLessThanOrEqual(.03));
  });
});

describe('shot body', () => {
  it('never braces on a single tap; braces within .4 s of held fire and releases by .5-.7 s after the last shot', () => {
    const tap = sim(60); frame(tap, true);
    for (let i = 0; i < 60; i++) { frame(tap); expect(tap.b.B).toBe(0); }
    const k = sim(60); k.held = true; frame(k, true);
    for (let i = 1; i < 24; i++) frame(k);
    expect(k.b.B).toBeGreaterThanOrEqual(.95);
    k.held = false; const last = k.s.weapon.shots; let since = 0;
    for (let i = 0; i < 60; i++) { frame(k); since = k.s.weapon.sinceShot; if (Math.abs(since - .5) < 1e-6) expect(k.b.B).toBeLessThanOrEqual(.15); if (Math.abs(since - .7) < 1e-6) expect(k.b.B).toBeLessThanOrEqual(.05); }
    expect(k.s.weapon.shots).toBe(last); expect(since).toBeGreaterThan(.7);
  });
  it('fades every per-shot output out under reduced motion: no kicks, no flare, smooth toggle', () => {
    const k = sim(60); k.held = true; frame(k, true);
    for (let i = 0; i < 20; i++) frame(k);
    // The toggle's own contribution to each shown output per frame: the gain step times the channel value.
    const raw = (c: number) => shown(k, c) / (k.b.m || 1);
    let prev = CHANNELS.map((_, c) => raw(c)), prevM = k.b.m, worst = 0;
    k.env.reduced = true;
    for (let i = 1; i <= 30; i++) {
      const before = prev; frame(k);
      CHANNELS.forEach((_, c) => { worst = Math.max(worst, Math.abs(k.b.m - prevM) * Math.max(Math.abs(before[c]), Math.abs(raw(c)))); });
      prev = CHANNELS.map((_, c) => raw(c)); prevM = k.b.m;
      if (i / 60 >= .15) { CHANNELS.forEach((_, c) => expect(out(k, c)).toBe(0)); expect(flareOf(k.b, true)).toBe(0); expect(k.d.core).toBeLessThanOrEqual(1); }
    }
    expect(worst).toBeLessThanOrEqual(.35); console.info('reduced-motion toggle, largest gain step per frame (peak units):', worst.toFixed(3));
    expect(k.s.weapon.shots).toBeGreaterThan(5);
  });
  it('runs the overheat vent timeline: hatch, head lead, then the vent pose; the vent flick and the natural end', () => {
    const k = sim(60), w = k.s.weapon, rows: { t: number; hatch: number; lead: number; v: number }[] = [];
    const lockFrame = (i: number) => { w.lock = 1; w.lockT = i / 60; w.justOverheated = i === 0; w.justVented = false; k.t += k.dt;
      advanceShotBody(k.b, k.s, k.env); rows.push({ t: i / 60, hatch: k.b.hatch, lead: k.b.headLead, v: k.b.v }); };
    for (let i = 0; i < 48; i++) lockFrame(i);
    const at = (t: number) => rows.find(r => r.t >= t - 1e-9)!, first = (f: (r: typeof rows[0]) => boolean) => rows.find(f)!.t;
    expect(rows.some(r => r.t <= .08 && r.hatch >= .9)).toBe(true);
    const over = Math.max(...rows.map(r => r.hatch)) - 1; expect(over).toBeGreaterThanOrEqual(.05); expect(over).toBeLessThanOrEqual(.15);
    expect(rows.filter(r => r.t <= .06).every(r => r.v < .05)).toBe(true); expect(at(.3).v).toBeGreaterThanOrEqual(.9);
    expect(first(r => r.v > .01) - first(r => r.lead > .01)).toBeGreaterThanOrEqual(.04 - 1e-9);
    expect(ventAimScale(k.b)).toBeCloseTo(1 - .6 * k.b.v, 12);
    // Vent success: the elbow flick peaks ~60 ms later and 30 v + 8 flick never drops below 0 deg.
    w.lock = 0; w.lockT = 0; w.justVented = true; const flick: [number, number][] = [];
    for (let i = 0; i < 60; i++) { advanceShotBody(k.b, k.s, k.env); w.justVented = false; flick.push([(i + 1) / 60, k.b.flickK]); expect(30 * k.b.v + 8 * k.b.flickK).toBeGreaterThanOrEqual(-1e-4); }
    const peak = flick.reduce((a, b) => b[1] > a[1] ? b : a);
    expect(peak[1]).toBeGreaterThanOrEqual(.9); expect(peak[1]).toBeLessThanOrEqual(1.1); expect(peak[0]).toBeGreaterThanOrEqual(.04); expect(peak[0]).toBeLessThanOrEqual(.09);
    // Natural end: the lock runs out, v falls monotonically below .05 within 400 ms, and there is no flick.
    const n = sim(60), nw = n.s.weapon; nw.lock = 1; nw.justOverheated = true; advanceShotBody(n.b, n.s, n.env); nw.justOverheated = false;
    for (let i = 0; i < 95; i++) advanceShotBody(n.b, n.s, n.env);
    nw.lock = 0; let v = n.b.v, t = 0;
    for (let i = 1; i <= 30; i++) { advanceShotBody(n.b, n.s, n.env); expect(n.b.v).toBeLessThanOrEqual(v); v = n.b.v; expect(n.b.flickK).toBe(0); if (v >= .05) t = i / 60; }
    expect(t).toBeLessThanOrEqual(.4);
  });
  it('rises the hatch and vent pose monotonically under reduced motion', () => {
    const k = sim(60, { reduced: true }), w = k.s.weapon; let h = 0, v = 0;
    w.lock = 1; w.justOverheated = true;
    for (let i = 0; i < 60; i++) { advanceShotBody(k.b, k.s, k.env); w.justOverheated = false; expect(k.b.hatch).toBeGreaterThanOrEqual(h); expect(k.b.v).toBeGreaterThanOrEqual(v); h = k.b.hatch; v = k.b.v; }
    expect(h).toBeGreaterThan(.9); expect(v).toBeGreaterThan(.8);
  });
  it('turns the head toward a kill by at most 5 deg and settles under .3 deg by .45 s', () => {
    const k = sim(60), p = { x: 10, y: 0, z: -5 };
    pushEvent(k.s, 'kill', p, p, null, 0); let max = 0;
    for (let i = 1; i <= 60; i++) { frame(k); const yaw = k.b.killYaw * k.b.killK; max = Math.max(max, Math.abs(yaw)); if (i / 60 >= .45) expect(Math.abs(yaw)).toBeLessThan(.3 * DEG); }
    expect(max).toBeLessThanOrEqual(5 * DEG + 1e-9); expect(max).toBeGreaterThan(4 * DEG); expect(k.b.killYaw).toBeLessThan(0);
  });
  it('snaps to exact rest on an epoch change', () => {
    const k = sim(60); k.held = true; frame(k, true); frame(k); frame(k);
    k.env.epoch = 2; frame(k);
    expect(springsAtRest(k.b.springs)).toBe(true); expect(k.b.B).toBe(0); expect(k.b.lastShots).toBe(k.s.weapon.shots);
  });
  it('never calls Math.random and allocates nothing in the per-frame bodies', () => {
    const files = ['follower', 'shotSprings', 'shotBody', 'shotDrive', 'shotBodyPose'].map(f => readFileSync(new URL(`../src/world/${f}.ts`, import.meta.url), 'utf8'));
    for (const src of files) expect(src).not.toMatch(/Math\.random/);
    const perFrame = ['stepFollower', 'advanceShotSprings', 'queueKick', 'kickNow', 'integrate', 'advanceShotBody', 'shoot', 'onEvent', 'follow', 'spring',
      'writeCannonDrive', 'flareOf', 'heatColor', 'applyShotBodyPre', 'applyShotBodyPost', 'channels', 'add', 'limitTouched'];
    for (const name of perFrame) {
      const src = files.find(f => new RegExp(`function ${name}\\(`).test(f));
      expect(src, name).toBeDefined();
      const start = src!.indexOf('{', src!.search(new RegExp(`function ${name}\\(`))); let depth = 0, end = start;
      for (; end < src!.length; end++) { if (src![end] === '{') depth++; if (src![end] === '}' && --depth === 0) break; }
      expect(src!.slice(start, end), name).not.toMatch(/\bnew /);
    }
  });
});
