import { describe, expect, it } from 'vitest';
import { advanceSuitRoll, createSuitRoll, ROLL, speedFade, type RollInput, type SuitRoll } from '../src/world/suitRoll';
import { settle } from '../src/game/presentation';
import { SWEEP, createTurnSweep } from '../src/game/turnSweep';
import { flightPose } from './flight-harness';
// Dynamics review S3 (2026-09-28): a shot fired in a bank set pose.aim to 1 in one frame and the reach dropped 30% at once, so
// the suit rolled 43.8 -> 13.7 deg (30 deg) in a single frame, at any frame rate. The reach now reads a settled aim weight (rate 6).
// The real advanceSuitRoll; visual only (the camera and physics never read the roll). Node math, not iPhone validation.
const DEG = 180 / Math.PI;
type Run = { angles: number[]; worst: number };
/** A steady left turn banked at 43.8 deg (42 m/s2 sideways, hero pose), then `aim` for 1 s from t = 2 s. */
function bank(hz: number, aim: (t: number) => number | undefined): Run {
  const p = { ...flightPose({ speed: 13 }), epoch: 0 }, r = createSuitRoll(), turn = createTurnSweep();
  const input: RollInput = { paused: false, reduced: false, flying: true, velocity: { x: 0, y: 0, z: -13 }, turn };
  const angles: number[] = []; let worst = 0;
  for (let k = 0; k < 3 * hz; k++) {
    p.aim = aim(k / hz); turn.lateral = 42 / hz;
    const before = angles.length ? angles[angles.length - 1] : 0, a = advanceSuitRoll(r, p, input, 1, 0, 1 / hz);
    angles.push(a); if (k >= 2 * hz - 2) worst = Math.max(worst, Math.abs(a - before) * DEG);
  }
  return { angles, worst };
}
/** The unpatched advanceSuitRoll (steady path, hero pose): the reach reads pose.aim directly. */
function reference(hz: number, aim: (t: number) => number | undefined) {
  const p = { ...flightPose({ speed: 13 }), epoch: 0 }, dt = 1 / hz, out: number[] = []; let lateral = 0, angle = 0;
  for (let k = 0; k < 3 * hz; k++) {
    if (k === 0) { out.push(0); continue; } // the first frame only seeds the epoch
    const a = aim(k / hz) ?? 0; lateral = settle(lateral, 42, ROLL.signal, dt);
    const base = ROLL.hero * p.flight, reach = a === 0 ? base : base * (1 - .7 * a);
    const target = reach * speedFade(13) * Math.tanh(Math.min(Math.max(lateral, -SWEEP.cap), SWEEP.cap) / ROLL.soft);
    angle = Math.min(reach, Math.max(-reach, settle(angle, target, ROLL.ease, dt))); out.push(angle);
  }
  return out;
}
const fire = (t: number) => t >= 2 ? 1 : 0;
describe('a shot fired in a bank', () => {
  it.each([30, 60, 120])('changes the roll by at most 3 deg in any one frame at %s Hz (was a 30 deg pop)', hz => {
    const before = reference(hz, fire); let popped = 0;
    for (let k = 2 * hz - 2; k < 3 * hz; k++) popped = Math.max(popped, Math.abs(before[k] - before[k - 1]) * DEG);
    expect(popped).toBeGreaterThan(28); // the unpatched reach cut: 43.8 -> 13.7 deg in one frame
    const run = bank(hz, fire);
    expect(run.worst).toBeLessThanOrEqual(hz === 30 ? 5 : 3); // 2.8 at 60 Hz, 1.4 at 120 Hz, 4.8 at 30 Hz (measured)
  });
  it('still banks 43.8 deg before the shot and settles on the aimed reach (30% of it) after', () => {
    const run = bank(60, fire);
    expect(run.angles[2 * 60 - 1] * DEG).toBeCloseTo(43.8, 0);
    expect(Math.abs(run.angles[3 * 60 - 1]) * DEG).toBeLessThan(13.8 + .3);
    expect(run.angles[3 * 60 - 1] * DEG).toBeGreaterThan(13.2 - 1);
    // Reaches the aimed value in a few tenths of a second, not instantly.
    const at = run.angles.findIndex((a, k) => k >= 120 && a * DEG < 20);
    expect((at - 120) / 60).toBeGreaterThan(.1); expect((at - 120) / 60).toBeLessThan(.5);
  });
  it('lets the roll go back up smoothly when the aim is released', () => {
    const run = bank(60, t => t >= 2 && t < 2.5 ? 1 : 0); let up = 0;
    for (let k = 2.5 * 60; k < 3 * 60; k++) up = Math.max(up, Math.abs(run.angles[k] - run.angles[k - 1]) * DEG);
    expect(up).toBeLessThan(3);
  });
});
describe('shooter off', () => {
  it.each([30, 60, 120])('the roll is bit-identical to the unpatched roll at %s Hz, with aim undefined or 0', hz => {
    for (const aim of [() => undefined, () => 0]) {
      const run = bank(hz, aim), ref = reference(hz, aim);
      run.angles.forEach((a, k) => expect(Object.is(a, ref[k])).toBe(true));
    }
  });
  it('the aim weight is exactly 0 until a shot, and snaps back to exactly 0 after it', () => {
    const p = { ...flightPose({ speed: 13 }), epoch: 0 }, r: SuitRoll = createSuitRoll(), turn = createTurnSweep();
    const input: RollInput = { paused: false, reduced: false, flying: true, velocity: { x: 0, y: 0, z: -13 }, turn };
    advanceSuitRoll(r, p, input, 1, 0, 1 / 60); expect(r.aim).toBe(0);
    p.aim = 1; advanceSuitRoll(r, p, input, 1, 0, 1 / 60); expect(r.aim).toBeGreaterThan(0);
    p.aim = 0; for (let k = 0; k < 120; k++) advanceSuitRoll(r, p, input, 1, 0, 1 / 60);
    expect(r.aim).toBe(0);
  });
});
