// Turn-360 spec 1.2-1.5: the Standard controls (twin look, classic thumb, desktop free cursor). Node math on the real modules;
// none of this is iPhone, trackpad or windowed-browser validation.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { touchLook } from '../src/game/touchLook';
import { thumbEdge, deskEdge } from '../src/game/thumbFlight';
import { exitKind } from '../src/game/trackpadFlight';
import { applyEdgeTurns, resetEdgeTurns, EDGE } from '../src/game/edgeTurn';
import { EdgeRest } from '../src/game/lookEdgeRest';
import { computeLayout } from '../src/game/touchLayout';
import { clearInput, runtime, startTrackpad } from '../src/game/runtime';
import { useGame } from '../src/game/store';
import { ADS_GAIN } from '../src/game/combat';
const DT = 1 / 60, FULL = 2 * Math.PI, DEG = 180 / Math.PI;
const prefs = { sustainedEdges: true, reduced: false, shooter: false };
const minJerk = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);
beforeEach(() => {
  useGame.setState({ touchLook: 1, touchAim: 1, lookAccel: true, reduced: false, invertY: false, aimAssist: 0, edgeRest: true });
  clearInput(true); resetEdgeTurns();
  runtime.yaw = 0; runtime.pitch = 0;
  const s = runtime.shooter; s.aim.blend = 0; s.assist.slow = 0; s.assist.engaged = false;
});
afterEach(() => { clearInput(true); resetEdgeTurns(); useGame.setState(useGame.getInitialState()); });
/** A min-jerk look swipe of px over ms at 60 Hz, fed through touchLook; returns the yaw turned in degrees. */
function swipe(px: number, ms: number) {
  runtime.yaw = 0;
  const n = Math.round(ms / (DT * 1000));
  let x = 0;
  for (let k = 1; k <= n; k++) { const nx = px * minJerk(k / n), dx = nx - x; touchLook(dx, 0, Math.abs(dx) / (DT * 1000)); x = nx; }
  return -runtime.yaw * DEG;
}
/** Steps applyEdgeTurns until |yaw| reaches a full turn; returns the seconds taken (Infinity past the limit). */
function timeTo360(p = prefs, limit = 10, each?: () => void) {
  for (let t = DT; t <= limit + 1e-9; t += DT) { each?.(); applyEdgeTurns(DT, p); if (Math.abs(runtime.yaw) >= FULL) return t; }
  return Infinity;
}
describe('twin look acceleration (1.2a)', () => {
  it('leaves slow drags exactly as before and turns fast swipes further', () => {
    for (const on of [true, false]) {
      useGame.setState({ lookAccel: on });
      runtime.yaw = 0; touchLook(30, 0, .1);
      expect(-runtime.yaw * DEG).toBeCloseTo(8.94, 0);
      expect(Math.abs(-runtime.yaw * DEG - 8.9)).toBeLessThanOrEqual(.3);
      runtime.yaw = 0; touchLook(80, 0, .32);
      expect(-runtime.yaw).toBeCloseTo(80 * .0052, 12);
    }
    useGame.setState({ lookAccel: false });
    const off = swipe(350, 200);
    expect(Math.abs(off - 104)).toBeLessThanOrEqual(3);
    useGame.setState({ lookAccel: true });
    expect(swipe(350, 200)).toBeGreaterThanOrEqual(240);
    useGame.setState({ reduced: true });
    expect(swipe(350, 200)).toBeCloseTo(off, 9);
  });
});
describe('edge factors (1.3, 1.5)', () => {
  it('classic thumb: 1 within 16 px, 0 at 64 px, 0.9 or more at 25 px; symmetric', () => {
    const w = 1000;
    expect(thumbEdge(w - 16, w)).toBe(1); expect(thumbEdge(w - 4, w)).toBe(1); expect(thumbEdge(16, w)).toBe(-1);
    expect(thumbEdge(w - 64, w)).toBe(0); expect(thumbEdge(64, w)).toBe(0);
    expect(thumbEdge(w - 25, w)).toBeGreaterThanOrEqual(.9); expect(thumbEdge(25, w)).toBeLessThanOrEqual(-.9);
  });
  it('desktop: full within 12 px, 0 at 72 px on a wide screen', () => {
    expect(deskEdge(1440, 1440)).toBe(1); expect(deskEdge(1440 - 12, 1440)).toBe(1); expect(deskEdge(1440 - 72, 1440)).toBe(0);
    expect(deskEdge(720, 1440)).toBe(0); expect(deskEdge(0, 1440)).toBe(-1);
  });
});
describe('applyEdgeTurns (1.4)', () => {
  it('classic thumb resting 25 px in: a 360 in 2.1 s or less (was 8.4 s)', () => {
    Object.assign(runtime.thumb, { active: true, edgeTurn: thumbEdge(1000 - 25, 1000) });
    const t = timeTo360();
    expect(t).toBeLessThanOrEqual(2.1);
    expect(runtime.yaw).toBeLessThan(0); // right edge turns right
  });
  it('desktop cursor held at the edge with sustained edges: 1.9 s or less', () => {
    startTrackpad(); runtime.trackpad.edgeTurn = 1;
    expect(timeTo360()).toBeLessThanOrEqual(1.9);
  });
  it('with sustained edges off the turn still fades after 0.28 s', () => {
    startTrackpad(); runtime.trackpad.edgeTurn = 1;
    const p = { ...prefs, sustainedEdges: false };
    for (let i = 0; i < 30; i++) applyEdgeTurns(DT, p);
    const at = runtime.yaw;
    for (let i = 0; i < 120; i++) applyEdgeTurns(DT, p);
    expect(runtime.yaw).toBe(at);
    expect(Math.abs(at)).toBeLessThan(.5);
  });
  it('a side exit keeps turning past 360 and stops after 6 s; a top or bottom exit stops after 1 s', () => {
    startTrackpad(); Object.assign(runtime.trackpad, { edgeTurn: -1, outside: 1, outsideAge: 0 });
    expect(timeTo360()).toBeLessThanOrEqual(2);
    expect(runtime.yaw).toBeGreaterThan(0); // left exit turns left
    for (let t = 0; t < 4.5; t += DT) applyEdgeTurns(DT, prefs);
    const held = runtime.yaw;
    for (let i = 0; i < 60; i++) applyEdgeTurns(DT, prefs);
    expect(runtime.yaw).toBe(held);
    expect(held).toBeGreaterThan(5 * EDGE.yaw);
    clearInput(true); resetEdgeTurns(); runtime.yaw = 0;
    startTrackpad(); Object.assign(runtime.trackpad, { edgeTurn: 1, outside: 2, outsideAge: 0 });
    for (let i = 0; i < 75; i++) applyEdgeTurns(DT, prefs);
    const stopped = runtime.yaw;
    for (let i = 0; i < 60; i++) applyEdgeTurns(DT, prefs);
    expect(runtime.yaw).toBe(stopped);
    expect(Math.abs(stopped)).toBeLessThan(EDGE.yaw * 1.1);
  });
  it('runs at 2.5 rad/s under reduced motion, and scales with the ADS gain while the blaster aims', () => {
    startTrackpad(); runtime.trackpad.edgeTurn = 1;
    const rate = (p: typeof prefs) => { for (let i = 0; i < 30; i++) applyEdgeTurns(DT, p); const y = runtime.yaw; applyEdgeTurns(DT, p); return (y - runtime.yaw) / DT; };
    expect(rate(prefs)).toBeCloseTo(EDGE.yaw, 9);
    expect(rate({ ...prefs, reduced: true })).toBeCloseTo(2.5, 9);
    runtime.shooter.aim.blend = 1;
    expect(rate({ ...prefs, shooter: true })).toBeCloseTo(EDGE.yaw * ADS_GAIN, 9);
  });
  it('eases the level in over 0.15 s', () => {
    runtime.stick.edgeTurn = 1;
    applyEdgeTurns(DT, prefs);
    expect(runtime.yaw).toBeCloseTo(DT / .15 * EDGE.yaw * DT, 12);
  });
});
describe('twin: a fast swipe, then an armed rest (1.2c)', () => {
  const cases: [number, number, number, number][] = [[852, 393, 350, 200], [393, 852, 250, 180]];
  for (const [w, h, px, ms] of cases) for (const flip of [false, true]) for (const dir of [1, -1]) {
    it(`${w}x${h} ${flip ? 'flipped' : 'right-handed'} turning ${dir > 0 ? 'right' : 'left'}: 360 in 1.4 s or less`, () => {
      const layout = computeLayout(w, h, { top: 0, right: 0, bottom: 0, left: 0 }, 56, { size: 1, flip, fire: true, aim: true, tapPad: false });
      const z = layout.stickZone!, rest = new EdgeRest();
      rest.configure(flip ? 0 : w, flip ? 1 : -1, flip ? z.l : z.r, flip ? -1 : 1);
      // Right-handed geometry, mirrored when flipped: turning toward the outer edge (right) or toward the stick boundary (left).
      const toOuter = (dir > 0) !== flip;
      const inner = flip ? w - z.l : z.r;
      const [a, b] = toOuter ? [w - 20 - px, w - 20] : [inner + 20 + px, inner + 20];
      const X = (u: number) => flip ? w - u : u;
      let t = 1000, k = 0, x = X(a);
      const n = Math.round(ms / (DT * 1000));
      rest.down(x, t);
      const time = timeTo360(prefs, 5, () => {
        t += DT * 1000; k++;
        if (k <= n) {
          const nx = X(a + (b - a) * minJerk(k / n)), dx = nx - x;
          touchLook(dx, 0, Math.abs(dx) / (DT * 1000)); x = nx;
          runtime.stick.edgeTurn = rest.move(x, t);
        } else runtime.stick.edgeTurn = rest.tick(t);
      });
      expect(time).toBeLessThanOrEqual(1.4);
      expect(Math.sign(runtime.yaw)).toBe(-dir);
    });
  }
});
describe('exitKind (1.5)', () => {
  it('classifies side and top/bottom exits', () => {
    expect(exitKind(1440, 450, 1440, 900)).toBe(1); expect(exitKind(1438, 450, 1440, 900)).toBe(1); expect(exitKind(0, 300, 1440, 900)).toBe(1);
    expect(exitKind(700, 0, 1440, 900)).toBe(2); expect(exitKind(700, 900, 1440, 900)).toBe(2);
    expect(exitKind(1440, 0, 1440, 900)).toBe(2); // exact corner: straight
    expect(exitKind(1435, 2, 1440, 900)).toBe(2); expect(exitKind(1439, 20, 1440, 900)).toBe(1);
    expect(exitKind(700, 450, 1440, 900)).toBe(2); // no band: straight
  });
});
