import { describe, expect, it } from 'vitest';
import { createSuitAnimation, type SuitAnimation } from '../src/world/suitAnimation';
import { approach, hovering, lift, pose, posed, quiet, rotations, simulate, walking, type Drive } from './suit-motion-harness';
const flying = pose({ flight: 1 });
/** Arm swing from the follow-through springs alone: the posed arm minus the same state with the springs at rest. */
const armSwing = (a: SuitAnimation, reduced = false) =>
  posed(a, flying, { reduced }).joints[3].rotation.x - posed(quiet(a), flying, { reduced }).joints[3].rotation.x;
const stop = (from: number): Drive => t => ({ flying: true, velocity: { x: 0, y: 0, z: t < 1 ? -from : 0 } });
describe('living suit motion: transitions', () => {
  it('pushes off from a crouch on a lift, and a caught fall never pops the model, whatever the stride phase', () => {
    expect(posed(simulate(1.1, 60, lift())).joints[8].rotation.x).toBeLessThan(-.8);
    let running = 0;
    simulate(2, 60, walking(0, -5), pose(), undefined, (() => { let previous = NaN; return (a: SuitAnimation, t: number) => {
      const up = posed(a).lift; if (t > 1) running = Math.max(running, Math.abs(up - previous)); previous = up; }; })());
    for (let k = 0; k < 40; k++) {
      const at = 1 + k / 60; let previous = NaN, worst = 0;
      const caught = simulate(at + .4, 60, t => ({ flying: t >= at, velocity: { x: 0, y: 0, z: -5 } }), pose(), undefined, (a, t) => {
        const up = posed(a).lift; if (t > at - .1) worst = Math.max(worst, Math.abs(up - previous)); previous = up;
      });
      expect(caught.takeoff).toBe(Infinity); expect(worst, `catch at ${at.toFixed(3)} s`).toBeLessThan(Math.max(.03, running * 1.2));
    }
  });
  it('absorbs a touchdown through the knees, with no jump on the touchdown frame at 60 or 30 Hz, but not a teleport', () => {
    const landing = (teleport: boolean) => {
      const p = pose(), a = simulate(1, 60, hovering, p, undefined, h => posed(h, p));
      if (teleport) p.epoch = 1;
      let last = posed(a, p);
      simulate(.1, 60, walking(0, 0), p, a, h => { last = posed(h, p); });
      return last;
    };
    expect(landing(false).joints[8].rotation.x).toBeLessThan(-.8); expect(landing(false).lift).toBeLessThan(-.08);
    expect(landing(true).joints[8].rotation.x).toBeGreaterThan(-.2);
    for (const [hz, bound] of [[60, .01], [30, .02]]) {
      let previous = NaN, touchdown = NaN;
      simulate(2, hz, approach, flying, undefined, a => {
        const up = posed(a, flying).lift; if (!a.flying && Number.isNaN(touchdown)) touchdown = Math.abs(up - previous); previous = up;
      });
      expect(touchdown, `${hz} Hz`).toBeLessThan(bound);
    }
  });
  it('swings the arms forward on a hard stop and back, over several frames, identically at 30, 60 and 120 Hz', () => {
    const traces = [30, 60, 120].map(hz => {
      const frames: number[] = [], tenths: number[] = [];
      simulate(3, hz, stop(13), flying, undefined, (a, t) => {
        if (t < 1) return;
        frames.push(armSwing(a)); if (t > 1 && Math.abs((t - 1) * 10 - Math.round((t - 1) * 10)) < 1e-6) tenths.push(frames.at(-1)!);
      });
      return { frames, tenths };
    });
    const { frames, tenths } = traces[1], steps = frames.map((v, i) => Math.abs(v - (i ? frames[i - 1] : 0)));
    expect(Math.max(...tenths)).toBeGreaterThan(.2); expect(Math.min(...tenths)).toBeLessThan(-.02); expect(Math.abs(tenths.at(-1)!)).toBeLessThan(.01);
    expect(Math.max(...steps)).toBeLessThan(.08);
    traces[0].tenths.forEach((v, i) => { expect(v).toBeCloseTo(tenths[i], 3); expect(v).toBeCloseTo(traces[2].tenths[i], 3); });
    // Even an instant stop from full flight speed at 30 Hz spreads the swing over several frames.
    const hard: number[] = []; simulate(2, 30, stop(34), flying, undefined, (a, t) => { if (t >= 1) hard.push(armSwing(a)); });
    expect(Math.max(...hard.map((v, i) => Math.abs(v - (i ? hard[i - 1] : 0))))).toBeLessThan(.15);
    // Setting off makes the limbs trail: backward when moving forward, to the left when moving right.
    const off = (x: number, z: number) => simulate(1.15, 60, t => ({ flying: true, velocity: t < 1 ? { x: 0, y: 0, z: 0 } : { x, y: 0, z } }), flying);
    const rest = simulate(1.15, 60, hovering, flying), right = off(13, 0);
    expect(armSwing(off(0, -13))).toBeLessThan(-.1);
    expect(posed(right, flying).joints[5].rotation.z).toBeLessThan(posed(rest, flying).joints[5].rotation.z - .05);
  });
  it('freezes the pose while paused and resumes without replaying a stale swing', () => {
    let frozen: number[] | null = null, stride = 0, worst = 0;
    simulate(2.5, 60, t => t < 1 ? { flying: false, velocity: { x: 0, y: 0, z: -5 } } : { flying: false, paused: t < 1.5, velocity: { x: 0, y: 0, z: 0 } },
      pose(), undefined, (a, t) => {
        if (t > 1 && t <= 1.5) {
          const now = rotations(posed({ ...a }).joints);
          if (!frozen) { frozen = now; stride = a.stride; } else { expect(now).toEqual(frozen); expect(a.stride).toBe(stride); }
        }
        if (t > 1.5) worst = Math.max(worst, Math.abs(a.lagForward.x), Math.abs(a.lagSide.x));
      });
    expect(frozen).not.toBeNull(); expect(worst).toBeLessThan(.01);
  });
  it('keeps the gait under reduced motion, removes the springs, twist and takeoff hold, and softens the rest', () => {
    const a = simulate(1.5, 60, walking(0, -5)), full = posed(a), soft = posed(a, pose(), { reduced: true });
    expect(soft.joints[4].rotation.x).toBeCloseTo(full.joints[4].rotation.x, 6);
    expect(soft.joints[0].rotation.y).toBe(0); expect(soft.joints[1].rotation.y).toBe(0);
    let springs = 0; simulate(2, 60, stop(13), flying, undefined, h => { springs = Math.max(springs, Math.abs(armSwing(h, true))); });
    expect(springs).toBe(0);
    const touchdown = (reduced: boolean) => posed(simulate(1.1, 60, t => ({ flying: t < 1, velocity: { x: 0, y: 0, z: 0 } })), pose(), { reduced }).lift;
    expect(Math.abs(touchdown(true))).toBeLessThan(Math.abs(touchdown(false)) * .5);
    const dip = (reduced: boolean) => { const p = pose(); let low = 0;
      simulate(1.4, 60, lift(), p, undefined, h => { low = Math.min(low, posed(h, p, { reduced }).lift); }, t => { p.position.y = Math.max(0, 6 * (t - 1)); });
      return low; };
    expect(dip(false)).toBeLessThan(-.3); expect(dip(true)).toBeGreaterThan(-.1);
    const bob = (reduced: boolean) => { const lifts: number[] = []; simulate(3, 60, hovering, flying, undefined, h => lifts.push(posed(h, flying, { reduced }).lift)); return Math.max(...lifts) - Math.min(...lifts); };
    expect(bob(true)).toBeLessThan(bob(false) * .4); expect(bob(false)).toBeGreaterThan(.08);
  });
  it('adds the fist-led launch only with hero poses', () => {
    const launch = simulate(1.25, 60, lift()), lead = (hero: number) => { const j = posed({ ...launch }, pose(), { hero }).joints; return j[3].rotation.x - j[2].rotation.x; };
    expect(lead(1)).toBeGreaterThan(.3); expect(Math.abs(lead(0))).toBeLessThan(.05);
  });
  it('restarts cleanly after a teleport', () => {
    const p = pose(), a = simulate(1, 60, stop(34), p); p.epoch = 2;
    const after = simulate(.05, 60, hovering, p, a);
    expect(after.lagForward.x).toBeCloseTo(0, 3); expect(after.takeoff).toBe(Infinity); expect(createSuitAnimation().epoch).toBeNaN();
  });
});
