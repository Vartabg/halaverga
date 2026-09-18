import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import type { Pose } from '../src/game/presentation';
import { parents, pivots } from '../src/world/suitGeometry';
import { applySuitPose } from '../src/world/suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation, type AnimationInput, type SuitAnimation } from '../src/world/suitAnimation';
type Drive = (t: number) => AnimationInput;
const pose = (patch: Partial<Pose & { epoch: number }> = {}) =>
  ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0, epoch: 0, ...patch });
const walking = (x: number, z: number): Drive => () => ({ flying: false, velocity: { x, y: 0, z } });
const hovering: Drive = () => ({ flying: true, velocity: { x: 0, y: 0, z: 0 } });
/** Plain groups at the exported pivots, so sole heights can be measured without loading the model. */
function rig() {
  const root = new Group(), joints = pivots.map(() => new Group());
  joints.forEach((joint, i) => {
    const parent: number = parents[i], p = pivots[i], o = parent < 0 ? [0, 0, 0] : pivots[parent];
    joint.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); (parent < 0 ? root : joints[parent]).add(joint);
  });
  return { root, joints };
}
function simulate(seconds: number, hz: number, drive: Drive, p = pose(), a = createSuitAnimation(), each?: (a: SuitAnimation, t: number) => void) {
  // Inputs are sampled at the start of each step, so every refresh rate sees a change at the same instant.
  for (let i = 1; i <= Math.round(seconds * hz); i++) { advanceSuitAnimation(a, p, drive((i - 1) / hz), 1 / hz); each?.(a, i / hz); }
  return a;
}
function posed(a: SuitAnimation, p = pose(), reduced = false) {
  const r = rig(); applySuitPose(r.joints, p, { hero: 1, epoch: 0 }, reduced);
  const lift = applySuitAnimation(r.joints, a, p, reduced);
  r.root.position.y = lift; r.root.updateMatrixWorld(true);
  const soles = [8, 9].map(i => r.joints[i].localToWorld(new Vector3(0, -.49, 0)).y);
  return { joints: r.joints, lift, soles };
}
describe('living suit motion', () => {
  it('advances the stride with distance travelled, identically at 30, 60 and 120 Hz', () => {
    const [a30, a60, a120] = [30, 60, 120].map(hz => simulate(2, hz, walking(0, -5)));
    expect(a30.stride).toBeCloseTo(a120.stride, 9); expect(a60.stride).toBeCloseTo((5 * 2 / 3.3) % 1, 9);
    expect(posed(a30).joints[8].rotation.x).toBeCloseTo(posed(a120).joints[8].rotation.x, 3);
  });
  it('swings the legs along the direction of travel with the knee folded on the way through', () => {
    const range = (drive: Drive) => {
      let x = 0, z = 0; const through: number[] = [];
      simulate(2, 120, drive, pose(), undefined, (a, t) => {
        if (t < 1) return;
        const now = posed(a), before = posed({ ...a, stride: (a.stride + .99) % 1 });
        x = Math.max(x, Math.abs(now.joints[4].rotation.x)); z = Math.max(z, Math.abs(now.joints[4].rotation.z));
        if (now.joints[8].rotation.x < -.8) through.push(Math.sign(now.joints[4].rotation.x - before.joints[4].rotation.x));
      });
      return { x, z, through };
    };
    const ahead = range(walking(0, -5)), back = range(walking(0, 5)), right = range(walking(5, 0));
    expect(ahead.x).toBeGreaterThan(.4); expect(ahead.z).toBeLessThan(.05); expect(ahead.through.every(s => s > 0)).toBe(true);
    expect(back.through.length).toBeGreaterThan(0); expect(back.through.every(s => s < 0)).toBe(true);
    expect(right.z).toBeGreaterThan(.2); expect(right.x).toBeLessThan(.05);
  });
  it('keeps the lower sole on the ground while walking, idling, pushing off and landing', () => {
    const drives: Drive[] = [walking(0, -5), walking(0, 5), walking(5, 0), walking(0, -1.5), walking(0, 0),
      t => ({ flying: t > 1, velocity: { x: 0, y: t > 1 ? 6 : 0, z: 0 } }), t => ({ flying: t < 1, landing: t < 1, velocity: { x: 0, y: t < 1 ? -1.5 : 0, z: 0 } })];
    for (const drive of drives) simulate(1.6, 60, drive, pose(), undefined, (a, t) => {
      if (a.flying && a.takeoff > .1) return;
      const low = Math.min(...posed(a).soles);
      expect(Math.abs(low + 1), `sole at ${t.toFixed(2)} s`).toBeLessThan(.012);
    });
  });
  it('keeps elbows flexing forward, knees backward and every joint bounded in each state', () => {
    const states: [Drive, Partial<Pose>][] = [[walking(0, -5), {}], [walking(0, 5), {}], [walking(-5, 0), {}], [walking(0, 0), {}],
      [hovering, { flight: 1 }], [() => ({ flying: true, velocity: { x: 0, y: 0, z: -34 } }), { flight: 1, power: 1, speed: 34, lean: -1.35 }],
      [t => ({ flying: t > .5, velocity: { x: 0, y: t > .5 ? 6 : 0, z: 0 } }), {}], [t => ({ flying: t < .5, velocity: { x: 0, y: 0, z: 0 } }), {}],
      [t => ({ flying: true, velocity: { x: 0, y: 0, z: t < .5 ? -34 : 0 } }), { flight: 1, brake: 1 }]];
    for (const reduced of [false, true]) for (const [drive, patch] of states) simulate(12, 30, drive, pose(patch), undefined, a => {
      const { joints, lift } = posed(a, pose(patch), reduced);
      for (const elbow of [6, 7]) expect(joints[elbow].rotation.x).toBeGreaterThanOrEqual(0);
      for (const knee of [8, 9]) expect(joints[knee].rotation.x).toBeLessThanOrEqual(0);
      expect(joints.every(j => [j.rotation.x, j.rotation.y, j.rotation.z].every(v => Number.isFinite(v) && Math.abs(v) <= Math.PI))).toBe(true);
      expect(Math.abs(lift)).toBeLessThan(.4);
    });
  });
  it('pushes off from a crouch on a lift but not when the suit catches a fall', () => {
    const lift = simulate(1.1, 60, t => ({ flying: t > 1, velocity: { x: 0, y: t > 1 ? 6 : 0, z: 0 } }));
    const caught = simulate(1.1, 60, t => ({ flying: t > 1, velocity: { x: 0, y: 0, z: 0 } }));
    expect(posed(lift).joints[8].rotation.x).toBeLessThan(-.8); expect(posed(lift).lift).toBeLessThan(-.08);
    expect(posed(caught).joints[8].rotation.x).toBeGreaterThan(-.2);
  });
  it('absorbs a touchdown through the knees but not a teleport to the ground', () => {
    const landing = (teleport: boolean) => {
      const p = pose(), a = simulate(1, 60, hovering, p);
      if (teleport) p.epoch = 1;
      return posed(simulate(.1, 60, walking(0, 0), p, a));
    };
    expect(landing(false).joints[8].rotation.x).toBeLessThan(-.8); expect(landing(false).lift).toBeLessThan(-.08);
    expect(landing(true).joints[8].rotation.x).toBeGreaterThan(-.2);
  });
  it('swings the limbs forward on a hard stop, overshoots and settles alike at 30, 60 and 120 Hz', () => {
    const lag = [30, 60, 120].map(hz => {
      const trace: number[] = []; simulate(3, hz, t => ({ flying: true, velocity: { x: 0, y: 0, z: t < 1 ? -13 : 0 } }), pose(), undefined,
        (a, t) => { if (Math.abs(t * 10 - Math.round(t * 10)) < 1e-6) trace.push(a.lagForward.x); });
      return trace;
    });
    const after = lag[1].slice(10);
    expect(Math.max(...after)).toBeGreaterThan(.5); expect(Math.min(...after)).toBeLessThan(-.05);
    expect(Math.abs(after.at(-1)!)).toBeLessThan(.02);
    lag[0].forEach((v, i) => { expect(v).toBeCloseTo(lag[1][i], 2); expect(v).toBeCloseTo(lag[2][i], 2); });
  });
  it('keeps the gait under reduced motion but softens the extras and adds no twist', () => {
    const a = simulate(1.5, 60, walking(0, -5)), full = posed(a), soft = posed(a, pose(), true);
    expect(soft.joints[4].rotation.x).toBeCloseTo(full.joints[4].rotation.x, 6);
    expect(soft.joints[0].rotation.y).toBe(0); expect(soft.joints[1].rotation.y).toBe(0);
    const bob = (reduced: boolean) => { const lifts: number[] = []; simulate(3, 60, hovering, pose({ flight: 1 }), undefined, h => lifts.push(posed(h, pose({ flight: 1 }), reduced).lift)); return Math.max(...lifts) - Math.min(...lifts); };
    expect(bob(true)).toBeLessThan(bob(false) * .4); expect(bob(false)).toBeGreaterThan(.08);
  });
});
