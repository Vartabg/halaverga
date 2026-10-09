import { describe, expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import { advanceFlightPose, angleDelta, CHASE_HEAD, FACING, presentation, type Pose, type PoseInput } from '../src/game/presentation';
import { aimed, resetAimed } from '../src/game/gesture/aimedShot';
import { aimFacing } from '../src/game/gesture/aimFacing';
import type { ShooterState } from '../src/game/combat';
import { FACING_AIM, FACING_PATH } from '../src/game/gesture/tuning';
import { runtime } from '../src/game/runtime';
import { advanceSuitAim, applySuitAim, createSuitAim } from '../src/world/aimPose';
import { orientSuit } from '../src/world/suitPose';
import { cruising, flightPose, frame, settledMix } from './flight-harness';
import { rig } from './suit-motion-harness';
import { VIEWS, aimMetrics, cameraRay, type Shot } from './aim-metrics';
// Gesture Lab choreography (spec 3.6, 4.5): the body turns toward a tapped shot, a drawn dive pitches the body, and the spin is
// the model's alone.
const DEG = Math.PI / 180, HZ = 1 / 60;
const pose = (): Pose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0, speed: 0, flight: 1, power: 0, brake: 0, aim: 0, spin: 0,
  bound: { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown } });
const hover = (patch: Partial<PoseInput>): PoseInput => ({ yaw: 0, pitch: 0, speed: 0, velocity: { x: 0, y: 0, z: 0 }, flying: true, reduced: false, ...patch });
function settleTo(p: Pose, input: PoseInput, frames = 120) { for (let i = 0; i < frames; i++) advanceFlightPose(p, input, HZ); return p; }
/** The shot a tap `yaw` rad off-centre makes: the camera ray turned about the vertical, through the published camera origin. */
function tapShot(viewYaw: number, viewPitch: number, yaw: number, dist: number): Shot {
  const base = cameraRay(viewYaw, viewPitch, dist, VIEWS[0]);
  const dir = base.dir.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw).normalize();
  return { origin: base.origin, dir, target: base.origin.clone().addScaledVector(dir, dist), view: base.view };
}

describe('Tap to Blast choreography', () => {
  it('turns the chest toward a drone tapped 45 deg off-centre (FACING_AIM) and lays the muzzle within 5 deg of the tap ray', () => {
    let worst = 0, at = '';
    const head = { x: 0, y: CHASE_HEAD, z: 0 }, out = { yaw: 0, pitch: 0 };
    for (const side of [1, -1]) for (const viewPitch of [-.3, 0, .3]) for (const dist of [12, 20, 40, 80]) {
      const aimYaw = side * 45 * DEG, shot = tapShot(0, viewPitch, aimYaw, dist);
      // The drone sits where the tap ray meets it; the aimed burst is on it (aimedShot state, as queueAimedBurst leaves it).
      const s = { aim: { origin: shot.origin, dir: cameraRay(0, viewPitch, dist).dir }, targets: [{ alive: true, c: shot.target }] } as unknown as ShooterState;
      Object.assign(aimed, { active: true, drone: 0 }); aimed.dir.x = shot.dir.x; aimed.dir.y = shot.dir.y; aimed.dir.z = shot.dir.z;
      aimFacing(s, head, 0, viewPitch, out);
      const p = settleTo(pose(), hover({ pitch: viewPitch, aim: 1, facing: 2, aimYaw: out.yaw, aimPitch: out.pitch }));
      expect(Math.abs(angleDelta(p.viewYaw, p.yaw))).toBeLessThanOrEqual(FACING_AIM.yaw + 1e-9);
      expect(angleDelta(p.viewYaw, p.yaw) * side).toBeGreaterThan(FACING.yaw);
      const r = rig(), fp = flightPose({ speed: 0, viewYaw: p.viewYaw, viewPitch: p.viewPitch, yaw: p.yaw, pitch: p.pitch, flight: 1 });
      frame(r, fp, settledMix(fp, { x: 0, y: 0, z: 0 }), cruising(0), 1, false);
      const a = createSuitAim();
      advanceSuitAim(a, 1, 1, 0, 0, 1, shot.origin, shot.target, false, false, HZ);
      expect(applySuitAim(r.joints, r.root, a, shot.origin, shot.dir)).toBe(true);
      const m = aimMetrics(r.joints, r.root, shot, a.dist);
      if (m.barrel > worst) { worst = m.barrel; at = JSON.stringify({ side, viewPitch, dist }); }
    }
    resetAimed();
    console.info(`45 deg tap: worst barrel error ${worst.toFixed(2)} deg at ${at}`);
    expect(worst, at).toBeLessThan(5);
  });
  it('gives no aim offset while no aimed burst runs', () => {
    resetAimed();
    const s = { aim: { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } }, targets: [] } as unknown as ShooterState;
    expect(aimFacing(s, { x: 0, y: 0, z: 0 }, 0, 0, { yaw: 9, pitch: 9 })).toEqual({ yaw: 0, pitch: 0 });
  });
  it('keeps the standard facing bounds exactly when no lab offset is given', () => {
    const p = settleTo(pose(), hover({ aim: 1 }));
    expect(p.bound).toEqual({ yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown });
    expect(p.yaw).toBeCloseTo(0, 9);
  });
});

describe('Draw facing', () => {
  const dive = hover({ speed: 24, velocity: { x: 0, y: -20, z: -13 } });
  it('FACING_PATH lets the body pitch to -0.9 in a dive, where the standard bound holds it at -0.15', () => {
    expect(settleTo(pose(), { ...dive, facing: 1 }).pitch).toBeCloseTo(-FACING_PATH.pitchDown, 6);
    expect(settleTo(pose(), dive).pitch).toBeCloseTo(-FACING.pitchDown, 6);
  });
  it('narrows back smoothly when the path ends (no snap in one frame)', () => {
    const p = settleTo(pose(), { ...dive, facing: 1 });
    let prev = p.pitch, jump = 0;
    for (let i = 0; i < 180; i++) { advanceFlightPose(p, dive, HZ); jump = Math.max(jump, Math.abs(p.pitch - prev)); prev = p.pitch; }
    expect(jump).toBeLessThan(.08);
    expect(p.pitch).toBeCloseTo(-FACING.pitchDown, 3);
  });
});

describe('spin', () => {
  it('is 0 under reduced motion and passes through otherwise', () => {
    const p = pose();
    advanceFlightPose(p, hover({ spin: 2 }), HZ); expect(p.spin).toBe(2);
    advanceFlightPose(p, hover({ spin: 2, reduced: true }), HZ); expect(p.spin).toBe(0);
  });
  it('rolls only the model about its travel axis (right side down for positive spin); the collider, anchor and runtime never move', () => {
    const before = { position: { ...runtime.position }, velocity: { ...runtime.velocity }, anchor: { ...presentation.position } };
    const p = flightPose({ speed: 0, flight: 1, yaw: 0, pitch: 0 }), m = { hero: 1, epoch: 0 };
    const still = new Group(), rolled = new Group(), full = new Group();
    orientSuit(still, p, m); orientSuit(rolled, p, m, 0, 0, Math.PI / 2); orientSuit(full, p, m, 0, 0, Math.PI * 2);
    const right = new Vector3(1, 0, 0).applyQuaternion(rolled.quaternion);
    expect(right.y).toBeLessThan(-.99);
    expect(rolled.position.toArray()).toEqual(still.position.toArray());
    expect(Math.abs(full.quaternion.dot(still.quaternion))).toBeCloseTo(1, 9);
    expect(new Vector3(0, 0, -1).applyQuaternion(rolled.quaternion).angleTo(new Vector3(0, 0, -1).applyQuaternion(still.quaternion))).toBeLessThan(1e-9);
    expect({ position: runtime.position, velocity: runtime.velocity, anchor: presentation.position }).toEqual(before);
    expect(still.quaternion.equals(new Quaternion().setFromEuler(still.rotation))).toBe(true);
  });
});
