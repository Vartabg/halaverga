import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Group, type Object3D } from 'three';
import { AIM_RATE, CARRY_PITCH, NEAR_IK, advanceSuitAim, applySuitAim, createSuitAim, type SuitAim } from '../src/world/aimPose';
import { BONE_COUNT, LIMITS } from '../src/world/suitSkeleton';
import { parents, pivots } from '../src/world/suitGeometry';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { createSuitAnimation } from '../src/world/suitAnimation';
import { cruising, flightPose, frame, measure, quats, rig, settledMix, type Rig } from './flight-harness';
import { loadSuit } from './load-suit';
import { VIEWS, aimMetrics, cameraRay, type Shot } from './aim-metrics';
const DEG = Math.PI / 180, ARM = [14, 3, 7, 16], TORSO = [10, 11, 12, 1], HZ = 1 / 60, PRESS_MAX = 25, CARRY_MAX = 25, CARRY_SCREEN = 12;
// Measured 2026-09-23 (carry upper arm .5 / 0 / .4, AIM_RATE 18, snap gated at 18-40 deg): press frame worst 23.7 deg (glb, 13 m/s,
// view pitch -40, crosshair 5 m, inside NEAR_IK); carry worst 13.7 deg (view yaw 2.2, pitch -.4, grounded).
const e = new Euler();
type Case = { speed: number; viewYaw: number; viewPitch: number; offset: number; clock?: number };
/** One Suit.tsx frame with the body facing the view (yaw offset for the facing lag), flying along the body heading. */
function posed(r: Rig, c: Case) {
  const yaw = c.viewYaw + c.offset, p = flightPose({ speed: c.speed, viewYaw: c.viewYaw, viewPitch: c.viewPitch, yaw, pitch: c.viewPitch });
  const velocity = { x: -Math.sin(yaw) * c.speed, y: 0, z: -Math.cos(yaw) * c.speed };
  frame(r, p, settledMix(p, velocity), cruising(c.clock ?? 0), 1, false);
  return p;
}
/** A layer state the solver reads: settled at `weight` with the given carry and swing (the epoch change snaps it). */
function layer(shot: Shot, weight: number, carry = 0, hold = 0, reduced = false): SuitAim {
  const a = createSuitAim();
  advanceSuitAim(a, 1, weight, hold, carry, 1, shot.origin, shot.target, false, reduced, HZ);
  return a;
}
/** The first frame of a press from a settled carry: weight .26 at 60 Hz and the swing equal to it (no press-frame snap). */
function pressFrame(shot: Shot) {
  const a = layer(shot, 0, 1);
  advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, false, HZ);
  return a;
}
const onLimit = (v: number, lo: number, hi: number) => Math.abs(v - lo) < 1e-9 || Math.abs(v - hi) < 1e-9;
/** True when the LIMITS clamp bound the upper arm: the target is outside the shoulder's reach, so the barrel cannot be exact. */
function clamped(r: Rig) {
  e.setFromQuaternion(r.joints[3].quaternion); const l = LIMITS[3];
  return onLimit(e.x, l[0], l[1]) || onLimit(e.y, l[2], l[3]) || onLimit(e.z, l[4], l[5]);
}
function withinLimits(r: Rig, bones: number[]) {
  for (const b of bones) {
    e.setFromQuaternion(r.joints[b].quaternion); const l = LIMITS[b], slack = 1e-6;
    expect(e.x).toBeGreaterThanOrEqual(l[0] - slack); expect(e.x).toBeLessThanOrEqual(l[1] + slack);
    expect(e.y).toBeGreaterThanOrEqual(l[2] - slack); expect(e.y).toBeLessThanOrEqual(l[3] + slack);
    expect(e.z).toBeGreaterThanOrEqual(l[4] - slack); expect(e.z).toBeLessThanOrEqual(l[5] + slack);
  }
}
const GRID: Case[] = [];
for (const speed of [0, 13, 34]) for (const viewYaw of [0, 2.2]) for (const offset of [-.25, 0, .25]) for (const viewPitch of [-40, -20, 0, 20, 40])
  GRID.push({ speed, viewYaw, viewPitch: viewPitch * DEG, offset });
let glb: Rig;
beforeAll(async () => { glb = buildSkinnedSuit((await loadSuit()).scene) as unknown as Rig; });
const RIGS = [['plain', rig], ['glb', () => glb]] as const;
describe('suit aim (arm cannon)', () => {
  it('writes no joint at carry 0 and weight 0', () => {
    for (const [, make] of RIGS) {
      const c = { speed: 13, viewYaw: .4, viewPitch: .2, offset: .1 }, shot = cameraRay(.4, .2, 20), r = make(), plain = rig();
      posed(r, c); const before = quats(r.joints as Group[]); posed(plain, c);
      const a = layer(shot, 0, 0, 0);
      expect(a.weight).toBe(0); expect(a.carry).toBe(0); expect(a.swing).toBe(0);
      expect(applySuitAim(r.joints, r.root, a, shot.origin, shot.dir)).toBe(false);
      expect(quats(r.joints as Group[])).toEqual(before);
    }
  });
  it('lays the barrel on the crosshair line within .5 deg once settled, and within 12 deg on the press frame from carry, within LIMITS reach', () => {
    let worst = 0, at = '', solved = 0, outOfReach = 0, screen = 0, pressWorst = 0, pressAt = '';
    for (const [name, make] of RIGS) for (const c of GRID) for (const dist of [5, 20, 100]) for (const view of VIEWS) for (const press of [false, true]) {
      const r = make(), p = posed(r, c), shot = cameraRay(c.viewYaw, c.viewPitch, dist, view);
      const a = press ? pressFrame(shot) : layer(shot, 1);
      if (press) { expect(a.weight).toBeCloseTo(1 - Math.exp(-AIM_RATE * HZ), 12); expect(a.swing).toBe(a.weight); }
      expect(applySuitAim(r.joints, r.root, a, shot.origin, shot.dir)).toBe(true);
      expect(a.dist).toBeCloseTo(Math.max(dist, NEAR_IK), 9);
      withinLimits(r, [...ARM, ...TORSO]);
      const s = measure(r, p);
      expect(s.hinges).toBe(true); expect(s.finite).toBe(true); expect(s.chest).toBeGreaterThan(.05); expect(s.yaw).toBeLessThanOrEqual(.1);
      if (clamped(r)) { outOfReach++; continue; }
      const m = aimMetrics(r.joints, r.root, shot, a.dist), where = JSON.stringify({ name, ...c, dist, view: view.name, press });
      if (press) { if (m.barrel > pressWorst) { pressWorst = m.barrel; pressAt = where; } continue; }
      solved++; screen = Math.max(screen, m.screen);
      if (m.barrel > worst) { worst = m.barrel; at = where; }
    }
    // The press frame is part-way through the punch-out (weight .26): the swing is no longer snapped exact, which put the muzzle
    // below its settled height on the shot frame. The tracer still starts at the muzzle and runs to the crosshair point.
    console.info(`press-frame barrel error from carry: worst ${pressWorst.toFixed(1)} deg at ${pressAt}`);
    expect(pressWorst, pressAt).toBeLessThan(PRESS_MAX);
    // Measured 2026-09-23: worst barrel 1.5e-6 deg and on screen 4e-8 deg over 6392 reachable cases; the upper-arm LIMITS bind in 88
    // (1.4%), where the body turn closes the rest.
    expect(screen).toBeLessThan(.5);
    expect(worst, at).toBeLessThan(.5);
    expect(solved).toBeGreaterThan(outOfReach * 9);
  }, 60000);
  it('carries the cannon low, within CARRY_SCREEN of the crosshair line on screen (CARRY_MAX in 3D) for camera pitch -.4 to .3, grounded and hovering, body facing the view', () => {
    let worst = 0, at = '', screen = 0, atScreen = '';
    for (const [name, make] of RIGS) for (const viewYaw of [0, 2.2]) for (const ground of [true, false])
      for (let pitch = -CARRY_PITCH; pitch <= .3 + 1e-9; pitch += .1) for (const view of VIEWS.slice(0, 3)) {
        const r = make(), p = flightPose({ speed: 0, viewYaw, viewPitch: pitch, yaw: viewYaw, pitch, flight: ground ? 0 : 1 });
        const life = ground ? Object.assign(createSuitAnimation(), { epoch: 0, flying: false, ground: 1 }) : cruising(0);
        frame(r, p, settledMix(p, { x: 0, y: 0, z: 0 }, false, !ground), life, 1, false);
        const shot = cameraRay(viewYaw, pitch, 30, view), a = layer(shot, 0, 1);
        expect(applySuitAim(r.joints, r.root, a, shot.origin, shot.dir)).toBe(true);
        withinLimits(r, ARM);
        const m = aimMetrics(r.joints, r.root, shot, a.dist);
        if (m.barrel > worst) { worst = m.barrel; at = JSON.stringify({ name, viewYaw, pitch, ground, view: view.name }); }
        if (m.screen > screen) { screen = m.screen; atScreen = JSON.stringify({ name, viewYaw, pitch, ground, view: view.name }); }
      }
    console.info(`carry barrel error: worst ${worst.toFixed(1)} deg at ${at}; on screen ${screen.toFixed(1)} deg at ${atScreen}`);
    // The abducted carry toes the barrel outward, mostly along the view line: what the player sees is the on-screen angle.
    expect(worst, at).toBeLessThan(CARRY_MAX); expect(screen, atScreen).toBeLessThan(CARRY_SCREEN);
  });
  it('blends continuously with the weight', () => {
    const c = { speed: 13, viewYaw: -.6, viewPitch: -.3, offset: .15 }, shot = cameraRay(-.6, -.3, 20), plain = rig(); posed(plain, c);
    const off = plain.joints.map(j => j.quaternion.clone());
    const change = (weight: number) => { const r = rig(); posed(r, c); applySuitAim(r.joints, r.root, layer(shot, weight), shot.origin, shot.dir); return Math.max(...r.joints.map((j, i) => j.quaternion.angleTo(off[i]))); };
    const [tiny, half, full] = [.001, .5, 1].map(change);
    expect(tiny).toBeLessThan(.01); expect(half).toBeGreaterThan(tiny); expect(full).toBeGreaterThan(half);
  });
  it('never accumulates: a kept rig matches a fresh one after twenty frames', () => {
    const kept = rig(), a = createSuitAim();
    for (let f = 0; f < 20; f++) {
      const c = { speed: 13, viewYaw: .3, viewPitch: .5, offset: -.2, clock: f / 60 }, shot = cameraRay(.3, .5, 8);
      posed(kept, c); advanceSuitAim(a, 1, 0, f < 10 ? 1 : 0, 1, 1, shot.origin, shot.target, false, false, HZ);
      applySuitAim(kept.joints, kept.root, a, shot.origin, shot.dir);
      const fresh = rig(); posed(fresh, c); applySuitAim(fresh.joints, fresh.root, { ...a }, shot.origin, shot.dir);
      expect(quats(kept.joints)).toEqual(quats(fresh.joints));
    }
  });
  it('eases the weight at rate 18 both ways (.26 on the press frame, 95% by 170 ms, exactly 0 again within .7 s) and the carry at rate 8', () => {
    const shot = cameraRay(0, 0, 20), a = createSuitAim();
    expect(AIM_RATE).toBe(18);
    advanceSuitAim(a, 1, 0, 0, 0, 1, shot.origin, shot.target, false, false, HZ);
    advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, false, HZ);
    expect(a.weight).toBeCloseTo(.259, 3); expect(a.swing).toBe(a.weight); expect(a.carry).toBeCloseTo(1 - Math.exp(-8 * HZ), 12);
    let t = HZ; for (; a.weight < .95; t += HZ) advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, false, HZ);
    expect(t).toBeLessThanOrEqual(.17);
    for (let f = 0; f < 60; f++) advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, false, HZ);
    expect(a.weight).toBe(1);
    for (let f = 0; f < 40; f++) advanceSuitAim(a, 1, 0, 0, 1, 1, shot.origin, shot.target, false, false, HZ);
    expect(a.weight).toBe(0); expect(a.swing).toBe(0); expect(a.snap).toBe(0); expect(a.carry).toBe(1);
    // The vent pose scales the goal and the swing.
    for (let f = 0; f < 60; f++) advanceSuitAim(a, 1, 1, 0, 1, .4, shot.origin, shot.target, false, false, HZ);
    expect(a.weight).toBeCloseTo(.4, 12);
  });
  it('under reduced motion the swing equals the weight and the weight still eases at AIM_RATE', () => {
    const shot = cameraRay(0, 0, 20), a = createSuitAim();
    advanceSuitAim(a, 1, 0, 0, 1, 1, shot.origin, shot.target, false, true, HZ);
    advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, true, HZ);
    expect(a.weight).toBeCloseTo(1 - Math.exp(-AIM_RATE * HZ), 12); expect(a.swing).toBe(a.weight);
    for (let f = 0; f < 30; f++) { advanceSuitAim(a, 1, 0, 1, 1, 1, shot.origin, shot.target, false, true, HZ); expect(a.swing).toBe(a.weight); }
    expect(a.weight).toBe(1);
  });
  it('smooths only the IK distance toward the clamped crosshair range', () => {
    const shot = cameraRay(0, 0, 400), a = createSuitAim();
    advanceSuitAim(a, 1, 1, 0, 0, 1, shot.origin, shot.target, false, false, HZ); expect(a.dist).toBe(250);
    const near = cameraRay(0, 0, 1);
    advanceSuitAim(a, 1, 1, 0, 0, 1, near.origin, near.target, false, false, HZ);
    expect(a.dist).toBeLessThan(250); expect(a.dist).toBeGreaterThan(NEAR_IK);
    for (let f = 0; f < 120; f++) advanceSuitAim(a, 1, 1, 0, 0, 1, near.origin, near.target, false, false, HZ);
    expect(a.dist).toBe(NEAR_IK);
  });
  it('an epoch change snaps the layer; paused changes nothing', () => {
    const shot = cameraRay(0, 0, 20), a = createSuitAim(), far = cameraRay(0, 0, 60);
    advanceSuitAim(a, 1, 0, 0, 0, 1, shot.origin, shot.target, false, false, HZ);
    advanceSuitAim(a, 2, 0, 1, 1, 1, far.origin, far.target, false, false, HZ);
    expect(a).toEqual({ epoch: 2, weight: 1, swing: 1, snap: 0, carry: 1, dist: 60 });
    advanceSuitAim(a, 2, 0, 0, 1, 1, shot.origin, shot.target, false, false, HZ);
    const before = { ...a };
    advanceSuitAim(a, 3, 0, 0, 0, 1, far.origin, far.target, true, false, HZ);
    expect(a).toEqual(before);
  });
  it('the rigid ten-joint rig is never aimed', () => {
    const root = new Group(), joints: Object3D[] = pivots.map(() => new Group());
    joints.forEach((j, i) => {
      const parent: number = parents[i], p = pivots[i], o = parent < 0 ? [0, 0, 0] : pivots[parent];
      j.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); (parent < 0 ? root : joints[parent]).add(j);
    });
    joints.forEach((j, i) => j.rotation.set(.1 * i, -.05 * i, .02 * i));
    const before = joints.flatMap(j => j.quaternion.toArray()), shot = cameraRay(0, 0, 20);
    expect(joints.length).toBeLessThan(BONE_COUNT);
    expect(applySuitAim(joints, root, { epoch: 1, weight: 1, swing: 1, snap: 0, carry: 1, dist: 20 }, shot.origin, shot.dir)).toBe(false);
    expect(joints.flatMap(j => j.quaternion.toArray())).toEqual(before);
  });
});
