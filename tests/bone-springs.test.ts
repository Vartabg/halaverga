import { describe, expect, it } from 'vitest';
import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { createBoneSprings, followTargets, restoreTargets } from '../src/world/boneSprings';
import { BODY_TUNES, WING_BONES } from '../src/world/suitSprings';

const angleTo = (a: Quaternion, b: Quaternion) => a.angleTo(b);
function run(hz: number, zeta: number, fps: number, seconds: number) {
  const bone = new Object3D(), s = createBoneSprings([bone], [[hz, zeta]]), goal = new Quaternion().setFromEuler(new Euler(1.2, 0, 0));
  followTargets(s, 0, true); // rest
  const trace: number[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) { bone.quaternion.copy(goal); followTargets(s, 1 / fps, false); trace.push(angleTo(bone.quaternion, goal)); }
  return { bone, goal, trace };
}
describe('bone springs', () => {
  it('lag behind a pose change, then settle exactly on it', () => {
    const { trace } = run(5, .62, 60, 2);
    expect(trace[0]).toBeGreaterThan(.9); // the first frame still trails most of the way
    expect(trace[trace.length - 1]).toBeLessThan(1e-3);
  });
  it('overshoot only as much as the damping allows', () => {
    const bone = new Object3D(), s = createBoneSprings([bone], [[5, .62]]), axis = new Vector3(1, 0, 0);
    followTargets(s, 0, true); let peak = 0;
    for (let k = 0; k < 120; k++) { bone.quaternion.setFromAxisAngle(axis, 1); followTargets(s, 1 / 60, false); peak = Math.max(peak, new Euler().setFromQuaternion(bone.quaternion).x); }
    expect(peak).toBeGreaterThan(1); expect(peak).toBeLessThan(1.1);
  });
  it('give the same motion at 30, 60 and 120 frames a second', () => {
    const a = run(6, .7, 30, .5), b = run(6, .7, 60, .5), c = run(6, .7, 120, .5);
    expect(angleTo(a.bone.quaternion, b.bone.quaternion)).toBeLessThan(.02);
    expect(angleTo(b.bone.quaternion, c.bone.quaternion)).toBeLessThan(.02);
  });
  it('snap jumps to the target, dt 0 holds, and restore hands the layers their own pose back', () => {
    const bone = new Object3D(), s = createBoneSprings([bone], [[5, .6]]), goal = new Quaternion().setFromEuler(new Euler(0, .8, 0));
    followTargets(s, 0, true); bone.quaternion.copy(goal); followTargets(s, 1 / 60, false);
    const held = bone.quaternion.clone(); bone.quaternion.copy(goal); followTargets(s, 0, false);
    expect(angleTo(bone.quaternion, held)).toBeLessThan(1e-6);
    restoreTargets(s); expect(angleTo(bone.quaternion, goal)).toBeLessThan(1e-6);
    followTargets(s, 1 / 60, true); expect(angleTo(bone.quaternion, goal)).toBeLessThan(1e-6);
  });
  it('tune all 21 bones, with the core firmer than the hands, and the feathers looser than the wing arm', () => {
    expect(BODY_TUNES).toHaveLength(21);
    expect(BODY_TUNES[0][0]).toBeGreaterThan(BODY_TUNES[15][0]);
    expect(WING_BONES).toBe(14);
  });
});
