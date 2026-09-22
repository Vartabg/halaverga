import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Group, Quaternion, Vector3, type Object3D } from 'three';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { createShooter, type Muzzle } from '../src/game/combat';
import { advanceSuitAim, applySuitAim, createSuitAim, type SuitAim } from '../src/world/aimPose';
import { BONE_COUNT, LIMITS } from '../src/world/suitSkeleton';
import { parents, pivots } from '../src/world/suitGeometry';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { cruising, flightPose, frame, measure, quats, rig, settledMix, type Rig } from './flight-harness';
import { loadSuit } from './load-suit';
const DEG = Math.PI / 180, TOUCHED = [10, 11, 12, 1, 14, 3, 7, 16];
const view = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), e = new Euler();
type Shot = { origin: Vector3; dir: Vector3; target: Vector3 };
/** The chase camera ray (boom in the view frame from the head, as toCamera()) and the point `dist` metres along it. */
function cameraRay(viewYaw: number, viewPitch: number, dist: number): Shot {
  view.set(viewPitch, viewYaw, 0);
  const origin = new Vector3(CHASE_BOOM.x, CHASE_BOOM.y, CHASE_BOOM.z).applyEuler(view).add(new Vector3(0, CHASE_HEAD, 0));
  const dir = new Vector3(0, 0, -1).applyEuler(view);
  return { origin, dir, target: origin.clone().addScaledVector(dir, dist) };
}
type Case = { speed: number; viewYaw: number; viewPitch: number; offset: number; clock?: number };
/** One Suit.tsx frame with the body facing the view (yaw offset for the facing lag), flying along the body heading. */
function posed(r: Rig, c: Case) {
  const yaw = c.viewYaw + c.offset, p = flightPose({ speed: c.speed, viewYaw: c.viewYaw, viewPitch: c.viewPitch, yaw, pitch: c.viewPitch });
  const velocity = { x: -Math.sin(yaw) * c.speed, y: 0, z: -Math.cos(yaw) * c.speed };
  frame(r, p, settledMix(p, velocity), cruising(c.clock ?? 0), 1, false);
  return p;
}
const muzzleOf = (): Muzzle => ({ ...createShooter().muzzle });
/** A settled layer at `weight` aimed at `shot` (the epoch change snaps it), applied to an already posed rig. */
function aim(r: Rig, shot: Shot, weight = 1, a: SuitAim = createSuitAim()) {
  advanceSuitAim(a, 1, weight, shot.origin, shot.target, 0, false, false, 1 / 60);
  const muzzle = muzzleOf(); applySuitAim(r.joints, r.root, a, shot.origin, shot.dir, muzzle);
  return muzzle;
}
/** Degrees between the hand's rest forearm axis (world) and the line from the fingertip muzzle to the target. */
function error(r: Rig, target: Vector3, muzzle: Muzzle) {
  const hand = r.joints[16], tip = hand.position.clone().setLength(.18);
  r.root.updateMatrixWorld(true);
  const point = hand.localToWorld(tip.clone()), axis = tip.clone().normalize().applyQuaternion(hand.getWorldQuaternion(q));
  expect(point.distanceTo(new Vector3(muzzle.x, muzzle.y, muzzle.z))).toBeLessThan(1e-9);
  return axis.angleTo(target.clone().sub(point)) / DEG;
}
function withinLimits(r: Rig) {
  for (const b of TOUCHED) {
    e.setFromQuaternion(r.joints[b].quaternion); const l = LIMITS[b], slack = 1e-6;
    expect(e.x).toBeGreaterThanOrEqual(l[0] - slack); expect(e.x).toBeLessThanOrEqual(l[1] + slack);
    expect(e.y).toBeGreaterThanOrEqual(l[2] - slack); expect(e.y).toBeLessThanOrEqual(l[3] + slack);
    expect(e.z).toBeGreaterThanOrEqual(l[4] - slack); expect(e.z).toBeLessThanOrEqual(l[5] + slack);
  }
}
const GRID: Case[] = [];
for (const speed of [0, 13]) for (const viewYaw of [0, 2.2]) for (const offset of [-.25, 0, .25]) for (const viewPitch of [-40, -20, 0, 20, 40])
  GRID.push({ speed, viewYaw, viewPitch: viewPitch * DEG, offset });
let glb: Rig;
beforeAll(async () => { glb = buildSkinnedSuit((await loadSuit()).scene) as unknown as Rig; });
describe('suit aim', () => {
  it('at weight 0 writes no joint and publishes no muzzle', () => {
    const c = { speed: 13, viewYaw: .4, viewPitch: .2, offset: .1 }, shot = cameraRay(.4, .2, 20), a = createSuitAim(), r = rig(), plain = rig();
    posed(r, c); posed(plain, c);
    const muzzle = aim(r, shot, 0, a);
    expect(a.weight).toBe(0); expect(muzzle.valid).toBe(false); expect(muzzle.weight).toBe(0);
    expect(quats(r.joints)).toEqual(quats(plain.joints));
  });
  it('points the emitter within 2 degrees of the crosshair on both rigs, hovering and cruising, inside the limits', () => {
    let worst = 0, at = '', checked = 0, behind = 0;
    for (const [name, make] of [['plain', rig], ['glb', () => glb]] as const) for (const c of GRID) for (const dist of [5, 20, 100]) {
      const r = make(), p = posed(r, c), shot = cameraRay(c.viewYaw, c.viewPitch, dist), muzzle = aim(r, shot);
      expect(muzzle.valid).toBe(true); expect(muzzle.weight).toBe(1);
      const err = error(r, shot.target, muzzle);
      withinLimits(r);
      const s = measure(r, p);
      expect(s.hinges).toBe(true); expect(s.finite).toBe(true); expect(s.chest).toBeGreaterThan(.05); expect(s.yaw).toBeLessThanOrEqual(.1);
      // 5 m along the chase ray ends beside the explorer: with a cruise lean or the body turned left it can lie up to 1.1 m behind
      // the shoulder, where no arm inside LIMITS can point. The arm reaches half a metre behind the shoulder plane (chest frame).
      const chest = r.joints[11], shoulder = chest.worldToLocal(r.joints[3].getWorldPosition(new Vector3()));
      if (chest.worldToLocal(shot.target.clone()).z - shoulder.z > .5) { expect(dist).toBe(5); behind++; continue; }
      checked++;
      if (err > worst) { worst = err; at = JSON.stringify({ name, ...c, dist }); }
    }
    expect(checked).toBeGreaterThan(GRID.length * 6 - 40); expect(behind).toBeLessThan(40);
    expect(worst, at).toBeLessThan(2);
  });
  it('blends continuously with the weight', () => {
    const c = { speed: 13, viewYaw: -.6, viewPitch: -.3, offset: .15 }, shot = cameraRay(-.6, -.3, 20), plain = rig(); posed(plain, c);
    const off = plain.joints.map(j => j.quaternion.clone());
    const change = (weight: number) => { const r = rig(); posed(r, c); aim(r, shot, weight); return Math.max(...r.joints.map((j, i) => j.quaternion.angleTo(off[i]))); };
    const [tiny, half, full] = [.001, .5, 1].map(change);
    expect(tiny).toBeLessThan(.01); expect(half).toBeGreaterThan(tiny); expect(full).toBeGreaterThan(half);
  });
  it('never accumulates: a kept rig matches a fresh one after twenty frames', () => {
    const kept = rig(), a = createSuitAim();
    for (let f = 0; f < 20; f++) {
      const c = { speed: 13, viewYaw: .3, viewPitch: .5, offset: -.2, clock: f / 60 }, shot = cameraRay(.3, .5, 8);
      posed(kept, c); advanceSuitAim(a, 1, 1, shot.origin, shot.target, f >> 2, false, false, 1 / 60);
      applySuitAim(kept.joints, kept.root, a, shot.origin, shot.dir, muzzleOf());
      const fresh = rig(); posed(fresh, c); applySuitAim(fresh.joints, fresh.root, { ...a }, shot.origin, shot.dir, muzzleOf());
      expect(quats(kept.joints)).toEqual(quats(fresh.joints));
    }
  });
  it('eases the weight in, then back to exactly 0 within .7 s, after which the pose is bit-identical to the layer off', () => {
    const c = { speed: 0, viewYaw: 0, viewPitch: 0, offset: 0 }, shot = cameraRay(0, 0, 20), a = createSuitAim();
    advanceSuitAim(a, 1, 0, shot.origin, shot.target, 0, false, false, 1 / 60);
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 0, false, false, 1 / 60);
    expect(a.weight).toBeGreaterThan(0); expect(a.weight).toBeLessThan(.5);
    for (let f = 0; f < 60; f++) advanceSuitAim(a, 1, 1, shot.origin, shot.target, 0, false, false, 1 / 60);
    expect(a.weight).toBe(1);
    for (let f = 0; f < 42; f++) advanceSuitAim(a, 1, 0, shot.origin, shot.target, 0, false, false, 1 / 60);
    expect(a.weight).toBe(0);
    const r = rig(), plain = rig(); posed(r, c); posed(plain, c);
    const muzzle = muzzleOf(); applySuitAim(r.joints, r.root, a, shot.origin, shot.dir, muzzle);
    expect(muzzle.valid).toBe(false); expect(quats(r.joints)).toEqual(quats(plain.joints));
    // Reduced motion snaps the weight.
    advanceSuitAim(a, 1, .7, shot.origin, shot.target, 0, false, true, 1 / 60); expect(a.weight).toBe(.7);
  });
  it('smooths only the IK distance toward the clamped crosshair range', () => {
    const shot = cameraRay(0, 0, 400), a = createSuitAim();
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 0, false, false, 1 / 60); expect(a.dist).toBe(250);
    const near = cameraRay(0, 0, 1);
    advanceSuitAim(a, 1, 1, near.origin, near.target, 0, false, false, 1 / 60);
    expect(a.dist).toBeLessThan(250); expect(a.dist).toBeGreaterThan(2);
    for (let f = 0; f < 120; f++) advanceSuitAim(a, 1, 1, near.origin, near.target, 0, false, false, 1 / 60);
    expect(a.dist).toBe(2);
  });
  it('kicks once per new shot, peaking near 1, then decays to exactly 0; reduced motion never kicks', () => {
    const shot = cameraRay(0, 0, 20), a = createSuitAim(), dt = 1 / 1000;
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 3, false, false, dt);
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 3, false, false, dt); expect(a.kick).toBe(0);
    let peak = 0, t = 0;
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 4, false, false, dt);
    for (; t < 3 && (a.kick || a.kickV); t += dt) { peak = Math.max(peak, a.kick); advanceSuitAim(a, 1, 1, shot.origin, shot.target, 4, false, false, dt); }
    expect(peak).toBeGreaterThan(.995); expect(peak).toBeLessThanOrEqual(1 + 1e-9);
    expect(a.kick).toBe(0); expect(a.kickV).toBe(0); expect(t).toBeLessThan(1);
    // Two shots in one frame add two impulses.
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 6, false, false, dt); const two = a.kickV;
    const b = { ...a, kick: 0, kickV: 0, shots: 6 }; advanceSuitAim(b, 1, 1, shot.origin, shot.target, 7, false, false, dt);
    expect(two / b.kickV).toBeCloseTo(2, 6);
    const calm = { ...a, kick: 0, kickV: 0 }; advanceSuitAim(calm, 1, 1, shot.origin, shot.target, 20, false, true, dt);
    expect(calm.kick).toBe(0); expect(calm.kickV).toBe(0); expect(calm.shots).toBe(20);
    // A live kick lifts the arm (visual only) and the muzzle still publishes.
    const r = rig(), still = rig(), c = { speed: 0, viewYaw: 0, viewPitch: 0, offset: 0 };
    posed(r, c); posed(still, c);
    const kicked = { ...createSuitAim(), epoch: 1, weight: 1, dist: 20, kick: 1 }, rest = { ...kicked, kick: 0 };
    const m1 = muzzleOf(), m0 = muzzleOf();
    applySuitAim(r.joints, r.root, kicked, shot.origin, shot.dir, m1); applySuitAim(still.joints, still.root, rest, shot.origin, shot.dir, m0);
    expect(m1.valid).toBe(true); expect(m1.y).toBeGreaterThan(m0.y + .01);
    expect(r.joints[7].rotation.x).toBeCloseTo(still.joints[7].rotation.x + 6 * DEG, 6);
  });
  it('an epoch change snaps the weight and zeroes the kick; paused changes nothing', () => {
    const shot = cameraRay(0, 0, 20), a = createSuitAim();
    advanceSuitAim(a, 1, 0, shot.origin, shot.target, 0, false, false, 1 / 60);
    advanceSuitAim(a, 1, 1, shot.origin, shot.target, 1, false, false, 1 / 60);
    expect(a.kickV).not.toBe(0);
    const far = cameraRay(0, 0, 60);
    advanceSuitAim(a, 2, 1, far.origin, far.target, 5, false, false, 1 / 60);
    expect(a).toEqual({ epoch: 2, weight: 1, dist: 60, kick: 0, kickV: 0, shots: 5 });
    advanceSuitAim(a, 2, 1, shot.origin, shot.target, 6, false, false, 1 / 60);
    const before = { ...a };
    advanceSuitAim(a, 3, 0, far.origin, far.target, 9, true, false, 1 / 60);
    expect(a).toEqual(before);
  });
  it('the rigid ten-joint rig is never aimed', () => {
    const root = new Group(), joints: Object3D[] = pivots.map(() => new Group());
    joints.forEach((j, i) => {
      const parent: number = parents[i], p = pivots[i], o = parent < 0 ? [0, 0, 0] : pivots[parent];
      j.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); (parent < 0 ? root : joints[parent]).add(j);
    });
    joints.forEach((j, i) => j.rotation.set(.1 * i, -.05 * i, .02 * i));
    const before = joints.flatMap(j => j.quaternion.toArray()), shot = cameraRay(0, 0, 20), muzzle = { ...muzzleOf(), valid: true, weight: 1 };
    expect(joints.length).toBeLessThan(BONE_COUNT);
    applySuitAim(joints, root, { ...createSuitAim(), epoch: 1, weight: 1, kick: 1 }, shot.origin, shot.dir, muzzle);
    expect(muzzle.valid).toBe(false); expect(muzzle.weight).toBe(0);
    expect(joints.flatMap(j => j.quaternion.toArray())).toEqual(before);
  });
});
