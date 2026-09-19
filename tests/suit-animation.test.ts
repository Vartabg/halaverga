import { beforeEach, describe, expect, it } from 'vitest';
import type { AnimatedPose } from '../src/world/suitAnimation';
import { calm, hovering, lift, approach, pose, posed, rig, rotations, simulate, walking, useClips, MODES, type Drive } from './suit-motion-harness';
describe.each(MODES)('living suit motion: gait and ground contact (%o)', mode => {
  beforeEach(() => useClips(mode));
  it('advances the stride with distance travelled at 10, 15, 30, 60 and 120 Hz', () => {
    const rates = [10, 15, 30, 60, 120].map(hz => simulate(2, hz, walking(0, -5)));
    for (const a of rates) expect(a.stride).toBeCloseTo((5 * 2 / 3.3) % 1, 9);
    expect(posed(rates[2]).joints[8].rotation.x).toBeCloseTo(posed(rates[4]).joints[8].rotation.x, 6);
  });
  it('swings the legs along the direction of travel with the knee folded on the way through', () => {
    const through = (drive: Drive) => {
      let reach = 0; const signs: number[] = [];
      simulate(2, 120, drive, pose(), undefined, (a, t) => {
        if (t < 1) return;
        const now = posed(a).joints, before = posed({ ...a, stride: (a.stride + .99) % 1 }).joints;
        reach = Math.max(reach, Math.abs(now[4].rotation.x));
        if (now[8].rotation.x < -.8) signs.push(Math.sign(now[4].rotation.x - before[4].rotation.x));
      });
      return { reach, signs };
    };
    const ahead = through(walking(0, -5)), back = through(walking(0, 5));
    expect(ahead.reach).toBeGreaterThan(.4); expect(ahead.signs.length).toBeGreaterThan(10); expect(ahead.signs.every(s => s > 0)).toBe(true);
    expect(back.signs.length).toBeGreaterThan(10); expect(back.signs.every(s => s < 0)).toBe(true);
  });
  it('steps sideways without crossing the legs, with the lifted foot moving toward the travel, in both directions', () => {
    for (const x of [5, -5]) {
      let narrow = Infinity, wide = 0; const signs: number[] = [];
      simulate(2, 120, walking(x, 0), pose(), undefined, (a, t) => {
        if (t < 1) return;
        const { soles, joints } = posed(a), gap = soles[1].x - soles[0].x, before = posed({ ...a, stride: (a.stride + .99) % 1 }).joints;
        narrow = Math.min(narrow, gap); wide = Math.max(wide, gap);
        expect(joints[4].rotation.z).toBeLessThanOrEqual(1e-9); expect(joints[5].rotation.z).toBeGreaterThanOrEqual(-1e-9);
        if (joints[8].rotation.x < -.8) signs.push(Math.sign(joints[4].rotation.z - before[4].rotation.z));
      });
      expect(narrow).toBeGreaterThan(.15); expect(wide).toBeGreaterThan(.5);
      expect(signs.length).toBeGreaterThan(10); expect(signs.every(s => s === Math.sign(x))).toBe(true);
    }
  });
  it('keeps the lower sole at ground height while walking, turning, idling and landing', () => {
    const cases: [Drive, Partial<AnimatedPose>][] = [[walking(0, -5), {}], [walking(0, 5), {}], [walking(5, 0), {}], [walking(0, -1.5), {}],
      [walking(0, 0), {}], [walking(0, -5), { bank: .3 }], [walking(0, 0), { bank: -.2, lean: .05 }], [approach, {}]];
    for (const [drive, patch] of cases) simulate(1.6, 60, drive, pose(patch), undefined, (a, t) => {
      if (a.flying) return;
      // Only while a touchdown's height change is being blended out may the sole sit off the ground: by what is left of that
      // change, which must be small and gone after .15 s.
      const low = Math.min(...posed(a, pose(patch)).soles.map(s => s.y)), u = Math.min(1, a.switched / .15);
      const remainder = Math.abs(a.blend) * (1 - u * u * (3 - 2 * u));
      expect(remainder).toBeLessThan(.06);
      expect(Math.abs(low + 1), `sole at ${t.toFixed(2)} s`).toBeLessThan(.005 + remainder);
    });
  });
  it('holds the takeoff height through the crouch although physics has already raised the anchor, at 60 and 30 Hz', () => {
    for (const hz of [60, 30]) {
      const p = pose();
      simulate(1.3, hz, lift(), p, undefined, a => {
        if (a.takeoff > .1) return;
        expect(Math.abs(Math.min(...posed(a, p).soles.map(s => s.y)) + 1)).toBeLessThan(.005);
      }, t => { p.position.y = Math.max(0, 6 * (t - 1)); });
    }
  });
  it('keeps the feet under the body through the push-off crouch and the landing absorb', () => {
    const at = (drive: Drive, seconds: number) => Math.max(...posed(simulate(seconds, 60, drive)).soles.map(s => Math.abs(s.z)));
    expect(at(lift(), 1.1)).toBeLessThan(.06);
    expect(at(t => ({ flying: t < 1, velocity: { x: 0, y: 0, z: 0 } }), 1.1)).toBeLessThan(.06);
  });
  it('keeps every joint bounded, with the elbows flexed forward while running and the hinge guards holding', () => {
    const states: [Drive, Partial<AnimatedPose>][] = [[walking(0, -5), {}], [walking(0, 5), {}], [walking(-5, 0), {}], [walking(0, 0), {}],
      [t => ({ flying: false, velocity: { x: 0, y: 0, z: t < .5 ? 0 : -5 } }), {}],
      [hovering, { flight: 1 }], [() => ({ flying: true, velocity: { x: 0, y: 0, z: -34 } }), { flight: 1, power: 1, speed: 34, lean: -1.35 }],
      [lift(.5), {}], [t => ({ flying: t < .5, velocity: { x: 0, y: 0, z: 0 } }), {}],
      [t => ({ flying: true, velocity: { x: 0, y: 0, z: t < .5 ? -34 : 0 } }), { flight: 1, brake: 1 }]];
    for (const [reduced, hero] of [[false, 1], [true, 1], [false, 0]] as const) for (const [drive, patch] of states) simulate(12, 30, reduced ? calm(drive) : drive, pose(patch), undefined, a => {
      const { joints, lift: up } = posed(a, pose(patch), { reduced, hero });
      for (const elbow of [6, 7]) expect(joints[elbow].rotation.x).toBeGreaterThanOrEqual(0);
      for (const knee of [8, 9]) expect(joints[knee].rotation.x).toBeLessThanOrEqual(0);
      expect(rotations(joints).every(v => Number.isFinite(v) && Math.abs(v) <= Math.PI)).toBe(true);
      expect(Math.abs(up)).toBeLessThan(.8);
    });
    const running = posed(simulate(1.5, 60, walking(0, -5))).joints;
    expect(Math.min(running[6].rotation.x, running[7].rotation.x)).toBeGreaterThan(.9);
  });
  it('rewrites every joint each frame, so posing the same rig again never accumulates', () => {
    const kept = rig();
    simulate(2, 60, t => ({ flying: t > 1.2, velocity: { x: 3, y: t > 1.2 ? 6 : 0, z: -4 } }), pose(), undefined, a => {
      expect(rotations(posed({ ...a }, pose(), { r: kept }).joints)).toEqual(rotations(posed({ ...a }).joints));
    });
  });
});
