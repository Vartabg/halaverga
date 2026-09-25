import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { createBrushScheme, type BrushHost } from '../src/game/gesture/brushScheme';
import {
  createManeuver, createManeuverOut, extendTurn, startTurn, startWhirl, stepManeuver, swipeMag, turnAngle, turnDuration,
  type Maneuver,
} from '../src/game/gesture/maneuvers';
import { createStrokeBuffer, type StrokeBuffer } from '../src/game/gesture/strokeBuffer';
import { classify } from '../src/game/gesture/strokeFeatures';
import type { GestureCtx } from '../src/game/gesture/types';
import { whirlAngle, whirlDuration } from '../src/game/gesture/whirl';
// Turn-360 spec 1.7: the Brush whirl stroke, its program, and stacked same-direction swipes. Node math on the real modules
// (60 Hz steps); none of this is a device check.

const dt = 1 / 60, DEG = Math.PI / 180, TAU = Math.PI * 2;

/** A stroke through a circular arc or spiral: centre (cx, cy), radius r0 -> r1, from deg0 sweeping `sweep` deg (+ = clockwise on
 * screen, y down), n segments at 12 ms. */
function arc(r0: number, sweep: number, n = 48, r1 = r0, deg0 = 0, cx = 420, cy = 200): StrokeBuffer {
  const b = createStrokeBuffer();
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = (deg0 + sweep * f) * DEG, r = r0 + (r1 - r0) * f, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) b.begin(1, 'touch', x, y, 1000); else b.push(x, y, 1000 + i * 12);
  }
  return b;
}
function line(dx: number, dy: number, n = 10, ms = 150): StrokeBuffer {
  const b = createStrokeBuffer().begin(1, 'touch', 300, 200, 1000);
  for (let i = 1; i <= n; i++) b.push(300 + dx * i / n, 200 + dy * i / n, 1000 + ms * i / n);
  return b;
}

/** Runs a program to its end: yaw integral, peak |rate|, length, and per-step spin / forward. */
function run(m: Maneuver) {
  const o = createManeuverOut(), spins: number[] = [], fwd: number[] = [];
  let yaw = 0, peak = 0, t = 0;
  while (m.id !== 'none' && t < 10) {
    stepManeuver(m, dt, 50, o); t += dt;
    yaw += o.yawRate * dt; peak = Math.max(peak, Math.abs(o.yawRate)); spins.push(o.spin); fwd.push(o.forward);
  }
  return { yaw, peak, t, spins, fwd };
}

function rig(over: Partial<BrushHost> = {}) {
  const st = { endLocks: 0, bursts: 0, guides: [] as string[] };
  const host: BrushHost = {
    flying: () => true, yaw: () => 0, clearance: () => false, landTarget: () => null,
    lassoBegin() {}, lassoAdd: () => 0, lassoEnd: closed => (closed ? st.endLocks : 0),
    lockBurst() { st.bursts++; }, lockNearest: () => false, guide: ev => { st.guides.push(ev); }, ...over,
  };
  const ctx: GestureCtx = { clock: 0, canLand: () => true, pathClear: () => true, groundBelow: () => 50, land() {}, say() {} };
  const b = createBrushScheme(host), pos = { x: 0, y: 30, z: 0 };
  let yaw = 0;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { b.step(dt, pos, ctx); yaw += gesture.yawRate * dt; } };
  step();
  return { st, b, step, yaw: () => yaw };
}
type Rig = ReturnType<typeof rig>;
/** Replays a finished buffer sample by sample into the scheme (down, move per sample, up with the real classifier). */
function feed(r: Rig, src: StrokeBuffer, settle = 0) {
  const s = createStrokeBuffer().begin(1, 'touch', src.x(0), src.y(0), src.t(0));
  r.b.down(s);
  for (let i = 1; i < src.count; i++) { s.push(src.x(i), src.y(i), src.t(i)); r.b.move(s); }
  for (let k = 0; k < settle && !r.b.view.committed; k++) { s.push(s.lastX, s.lastY, s.lastT + 16); r.b.move(s); }
  r.b.up(s, classify(s, 'brush'));
  return s;
}

describe('whirlAngle', () => {
  it('reads loops, half loops and spirals by winding, in half-turn steps; small loops and swipes are not whirls', () => {
    expect(whirlAngle(arc(100, 360))).toBeCloseTo(-TAU, 9); // clockwise turns right
    expect(whirlAngle(arc(100, -360))).toBeCloseTo(TAU, 9);
    expect(whirlAngle(arc(60, 360))).toBe(0); // radius under 70 px: a Roll circle
    expect(whirlAngle(arc(80, 360))).toBeCloseTo(-TAU, 9); // a natural 80 px thumb loop whirls (review 2026-09-25; was a Roll)
    expect(Math.abs(whirlAngle(arc(110, 180, 24)))).toBeCloseTo(Math.PI, 9);
    expect(Math.abs(whirlAngle(arc(100, 540, 72, 150)))).toBeCloseTo(3 * Math.PI, 9);
    expect(whirlAngle(line(300, 0))).toBe(0);
    expect(whirlAngle(arc(400, 120, 24))).toBe(0); // a gentle wide arc: too little winding
  });
});

describe('the whirl program', () => {
  it('a 360 lasts 1.3 s under 6.5 rad/s and a 180 lasts 0.9 s; yaw integrates to the angle within 2%', () => {
    for (const [A, dur] of [[TAU, 1.3], [Math.PI, 0.9], [-TAU, 1.3]] as const) {
      const r = run(startWhirl(createManeuver(), A));
      expect(Math.abs(r.yaw - A)).toBeLessThan(Math.abs(A) * 0.02);
      expect(r.t).toBeGreaterThanOrEqual(dur - 1e-9); expect(r.t).toBeLessThan(dur + dt + 1e-9);
      expect(r.peak).toBeLessThanOrEqual(6.5);
    }
    expect(whirlDuration(4 * Math.PI)).toBeCloseTo(4 * Math.PI / (0.75 * 6.5), 9); // 720: stretched to keep the peak
  });
  it('under reduced motion a 360 lasts 3.35 s or more and stays within 2.5 rad/s', () => {
    const r = run(startWhirl(createManeuver(), TAU, true));
    expect(r.t).toBeGreaterThanOrEqual(3.35); expect(r.peak).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(Math.abs(r.yaw - TAU)).toBeLessThan(TAU * 0.02);
  });
  it('banks into the turn and back out level, and slows the cruise to 0.7 mid-program', () => {
    for (const A of [TAU, -TAU]) {
      const r = run(startWhirl(createManeuver(), A)), mid = r.spins[Math.floor(r.spins.length / 2)];
      expect(Math.sign(mid)).toBe(-Math.sign(A));
      expect(Math.max(...r.spins.map(Math.abs))).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(r.spins[r.spins.length - 1]).toBe(0);
      expect(r.fwd[Math.floor(r.fwd.length / 2)]).toBeLessThanOrEqual(0.7 + 1e-9);
    }
  });
});

describe('Brush whirl stroke and stacked turns', () => {
  beforeEach(() => { gesture.scheme = 'brush'; clearGesture(); });
  afterEach(() => { gesture.scheme = 'off'; gesture.step = null; clearGesture(); });

  it('a big loop in open sky whirls (facing 1 during it, 0 after); a loop around drones locks instead', () => {
    let r = rig();
    feed(r, arc(110, 360));
    expect(r.b.view.program).toBe('whirl'); expect(r.st.guides).toContain('turn');
    r.step(); expect(gesture.facing).toBe(1);
    r.step(120);
    expect(r.b.view.program).toBe('none'); expect(gesture.facing).toBe(0);
    expect(r.yaw()).toBeCloseTo(-TAU, 1);
  });
  it('a whirl-size loop whirls even around drones; a smaller loop around drones is Lock (review 2026-09-25)', () => {
    // Drones inside the loop, both directions: the lasso would lock (live and at the close), but the whirl wins.
    for (const sweep of [360, -360, 400]) {
      const r = rig({ lassoAdd: () => 2 }); r.st.endLocks = 2;
      feed(r, arc(110, sweep));
      expect(r.st.bursts, `sweep ${sweep}`).toBe(0); expect(r.b.view.program).toBe('whirl');
      r.step(120); expect(Math.abs(r.yaw())).toBeCloseTo(TAU, 1);
    }
    const r = rig({ lassoAdd: () => 1 }); r.st.endLocks = 1;
    feed(r, arc(50, 360));
    expect(r.st.bursts).toBe(1); expect(r.b.view.program).toBe('none');
  });
  it('shows the whirl live: view.whirl turns on once the loop is whirl-size, with no lock count, and clears at the end', () => {
    const r = rig({ lassoAdd: () => 2 }), src = arc(110, 360), s = createStrokeBuffer().begin(1, 'touch', src.x(0), src.y(0), src.t(0));
    r.b.down(s);
    const seen: boolean[] = [];
    for (let i = 1; i < src.count; i++) { s.push(src.x(i), src.y(i), src.t(i)); r.b.move(s); seen.push(r.b.view.whirl); if (r.b.view.whirl) expect(r.b.view.locks).toBe(0); }
    expect(seen[5]).toBe(false); expect(seen[seen.length - 1]).toBe(true);
    r.b.up(s, classify(s, 'brush'));
    expect(r.b.view.whirl).toBe(false);
    const small = rig({ lassoAdd: () => 1 }), a = arc(50, 360), t = createStrokeBuffer().begin(1, 'touch', a.x(0), a.y(0), a.t(0));
    small.b.down(t);
    for (let i = 1; i < a.count; i++) { t.push(a.x(i), a.y(i), a.t(i)); small.b.move(t); expect(small.b.view.whirl).toBe(false); }
    expect(small.b.view.locks).toBe(1);
  });
  it('a mouse loop whirls as soon as it closes (330 deg), without waiting for the hover-ink rest', () => {
    const r = rig(), src = arc(110, 400, 60), s = createStrokeBuffer().begin(1, 'mouse', src.x(0), src.y(0), src.t(0));
    r.b.down(s);
    let at = -1;
    for (let i = 1; i < src.count && at < 0; i++) { s.push(src.x(i), src.y(i), src.t(i)); r.b.move(s); if (r.b.view.committed) at = i; }
    expect(at).toBeGreaterThan(0);
    expect(Math.abs(s.winding)).toBeGreaterThanOrEqual(330); expect(Math.abs(s.winding)).toBeLessThan(345);
    expect(r.b.view.program).toBe('whirl');
    r.b.up(s, classify(s, 'brush')); expect(r.b.view.program).toBe('whirl'); // the commit already ran it; the release adds nothing
    // Touch keeps the release: the same loop by finger is not committed mid-stroke.
    const t = rig(); feed(t, src); expect(t.b.view.program).toBe('whirl');
  });
  it('the whirl fallbacks spin a full circle each way', () => {
    for (const [a, sign] of [['whirl-left', 1], ['whirl-right', -1]] as const) {
      const r = rig(); r.b.fallback(a);
      expect(r.b.view.program).toBe('whirl');
      r.step(120);
      expect(r.yaw()).toBeCloseTo(sign * TAU, 1);
    }
  });
  it('four right swipes 0.25 s apart make a 360 within 2.1 s, without cancelling each other', () => {
    const r = rig();
    for (let k = 0; k < 4; k++) {
      feed(r, line(300, 0), 5);
      expect(r.b.view.lastCancel).toBeNull();
      r.step(15);
    }
    r.step(Math.round(2.1 / dt) - 60);
    expect(Math.abs(r.yaw() + TAU)).toBeLessThan(TAU * 0.1);
  });
  it('stacked turns stay continuous and under the peak caps (5.5, or 2.5 under reduced motion)', () => {
    for (const reduced of [false, true]) {
      const m = startTurn(createManeuver(), -1, 1), o = createManeuverOut();
      let yaw = 0, peak = 0, jump = 0, last = 0;
      for (let i = 0; i < 400 && m.id !== 'none'; i++) {
        if (i === 15 || i === 30 || i === 45) extendTurn(m, -1, 1, reduced);
        stepManeuver(m, dt, 50, o); yaw += o.yawRate * dt;
        peak = Math.max(peak, Math.abs(o.yawRate)); if (i) jump = Math.max(jump, Math.abs(o.yawRate - last)); last = o.yawRate;
      }
      expect(Math.abs(yaw + TAU)).toBeLessThan(TAU * 0.02);
      expect(peak).toBeLessThanOrEqual((reduced ? 2.5 : 5.5) + 1e-6);
      expect(jump).toBeLessThan(0.25); // no step drops the rate back to 0 at a restart
    }
  });
  it('an opposite swipe restarts, and a single swipe is unchanged', () => {
    const m = startTurn(createManeuver(), -1, 1);
    for (let i = 0; i < 15; i++) stepManeuver(m, dt, 50, createManeuverOut());
    extendTurn(m, 1, 1);
    expect([m.sign, m.t, m.rc, m.angle, m.dur]).toEqual([1, 0, 0, turnAngle(1), turnDuration(turnAngle(1))]);
    const a = run(startTurn(createManeuver(), 1, 0.6)), b = run(extendTurn(createManeuver(), 1, 0.6));
    expect([b.t, b.peak, b.yaw]).toEqual([a.t, a.peak, a.yaw]);
    const r = rig();
    feed(r, line(300, 0), 5); r.step(15);
    feed(r, line(-300, 0), 5);
    expect(r.b.view.lastCancel).toBe('stroke'); r.step(10); expect(gesture.yawRate).toBeGreaterThan(0);
  });
  it('a full-strength swipe is 45% of the surface width (160-240 px)', () => {
    expect(swipeMag(177, 393)).toBe(1);
    expect(swipeMag(240)).toBe(1); expect(swipeMag(239)).toBeLessThan(1); expect(swipeMag(240, 1440)).toBe(1);
  });
  it('four natural 240 px swipes make a 360 on a landscape phone and on a desktop (review 2026-09-25: 290 deg)', () => {
    for (const w of [852, 1440]) {
      const r = rig({ width: () => w });
      for (let k = 0; k < 4; k++) { feed(r, line(240, 0), 5); r.step(15); }
      r.step(Math.round(2.4 / dt));
      expect(Math.abs(r.yaw() + TAU), `width ${w}`).toBeLessThan(TAU * 0.02);
    }
  });
  it('allocates nothing per step or per whirl check', () => {
    const names = ['Float32Array', 'Float64Array', 'Array', 'Object', 'Map', 'Set'] as const;
    const g = globalThis as unknown as Record<string, unknown>, saved = names.map(n => g[n]);
    const m = createManeuver(), o = createManeuverOut(), s = arc(110, 360);
    let made = 0;
    try {
      names.forEach((n, i) => { g[n] = new Proxy(saved[i] as object, { construct(t, a, nt) { made++; return Reflect.construct(t as never, a, nt); } }); });
      for (let k = 0; k < 20; k++) {
        whirlAngle(s); startWhirl(m, TAU); extendTurn(m, 1, 1);
        for (let i = 0; i < 90; i++) stepManeuver(m, dt, 50, o);
      }
    } finally { names.forEach((n, i) => { g[n] = saved[i]; }); }
    expect(made).toBe(0);
    const src = readFileSync('src/game/gesture/whirl.ts', 'utf8');
    expect(src).not.toMatch(/\bnew\s|\[\s*\]|=>\s*\(\{/);
  });
});
