import { expect, test } from 'vitest';
import { Euler, Group, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { applySuitPose, advanceSuitMotion, orientSuit } from '../src/world/suitPose';
import { buildSuitRig } from '../src/world/suitRig';
import { advanceFlightPose, angleDelta, CHASE_BOOM, CHASE_HEAD, FACING, type Pose } from '../src/game/presentation';
import { ROLL, sightLine } from '../src/world/suitRoll';
import { boomFor } from '../src/game/cameraFx';
// Speed alone decides the lean and the pitch that offsets it, exactly as advanceFlightPose derives them.
const pose = (patch: Partial<Pose> = {}): Pose => {
  const base = { viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, bank: 0, speed: 34, flight: 1, brake: 0, ...patch };
  const power = patch.power ?? Math.min(1, Math.max(0, (base.speed - 3) / 25)) * base.flight;
  return { ...base, power, lean: patch.lean ?? -1.35 * power + base.brake * .12 };
};
const joints = () => Array.from({ length: 10 }, () => new Group());
const hero = { hero: 1, epoch: 0 };
const states = [pose({ speed: 0 }), pose({ speed: 13 }), pose(), pose({ bank: .3 }), pose({ bank: -.3, pitch: -1 }),
  pose({ speed: 10, brake: 1 }), pose({ pitch: 1.2, viewPitch: 1.2 }), pose({ speed: 0, flight: 0 })];
test('power flight leads with the right fist along the travel axis and trails the left arm; braking lifts the left knee', () => {
  const rig = joints();
  applySuitPose(rig, pose(), hero, false);
  expect(rig[3].rotation.x).toBeGreaterThan(2.5); expect(rig[2].rotation.x).toBeLessThan(0);
  applySuitPose(rig, pose({ brake: 1, speed: 10 }), hero, false);
  expect(rig[8].rotation.x).toBeLessThan(-1);
  expect(rig[4].rotation.x).toBeGreaterThan(rig[5].rotation.x);
  // Braking flares both arms forward, in hero flourishes and in the classic pose alike.
  for (const h of [0, 1]) {
    applySuitPose(rig, pose({ brake: 1, speed: 10 }), { hero: h, epoch: 0 }, false);
    for (const shoulder of [2, 3]) expect(rig[shoulder].rotation.x).toBeGreaterThan(0);
  }
});
test('elbows only flex forward and knees only flex backward in every state, hero or classic, reduced or not', () => {
  const rig = joints();
  for (const p of states) for (const reduced of [false, true]) for (const h of [0, .5, 1]) {
    applySuitPose(rig, p, { hero: h, epoch: 0 }, reduced);
    for (const elbow of [6, 7]) expect(rig[elbow].rotation.x).toBeGreaterThanOrEqual(0);
    for (const knee of [8, 9]) expect(rig[knee].rotation.x).toBeLessThanOrEqual(0);
    expect(rig.every(j => [j.rotation.x, j.rotation.y, j.rotation.z].every(v => Number.isFinite(v) && Math.abs(v) <= Math.PI))).toBe(true);
  }
});
test('the back faces the chase camera for every view pitch, bounded body pitch, bank, speed and turn roll', () => {
  const root = new Group(), back = new Vector3(), front = new Vector3(), toCamera = new Vector3(), q = new Euler(0, 0, 0, 'YXZ');
  let drift = 0;
  for (const viewPitch of [-1.3, -.8, -.12, 0, .5, 1, 1.25]) for (const offset of [-FACING.pitchDown, 0, FACING.pitchUp])
    for (const bank of [-.3, 0, .3]) for (const speed of [0, 8, 13, 34]) for (const yaw of [-FACING.yaw, 0, FACING.yaw]) for (const h of [0, 1]) {
      const p = pose({ viewPitch, pitch: viewPitch + offset, bank, speed, yaw });
      toCamera.copy(CHASE_BOOM).applyEuler(q.set(viewPitch, 0, 0)).add(new Vector3(0, CHASE_HEAD, 0)).normalize();
      orientSuit(root, p, { hero: h, epoch: 0 }, 0, 1); const still = back.set(0, 0, 1).applyQuaternion(root.quaternion).dot(toCamera);
      for (const roll of [0, -.4, .4, -.8, .8, -1.2, 1.2]) {
        orientSuit(root, p, { hero: h, epoch: 0 }, roll, roll ? 1 : 0);
        back.set(0, 0, 1).applyQuaternion(root.quaternion); front.set(0, 0, -1).applyQuaternion(root.quaternion);
        // Never negative, so the chest never comes around. The floor is low because an upright hover viewed from
        // straight overhead is legitimately edge-on: the camera sees the head, not the chest.
        expect(back.dot(toCamera)).toBeGreaterThan(bank === 0 && yaw === 0 ? .1 : .05); expect(front.dot(toCamera)).toBeLessThan(0);
        // The roll turns the body about the line to the camera: facing is unchanged by it.
        if (roll) drift = Math.max(drift, Math.abs(back.dot(toCamera) - still));
      }
    }
  if (process.env.ROLL_REPORT) console.log(`root facing drift under roll ${drift.toExponential(1)}`);
  expect(drift).toBeLessThan(1e-6);
});
test('the root heading follows the travel yaw, and hovering stays upright wherever the player looks', () => {
  const root = new Group(), forward = new Vector3(), up = new Vector3();
  for (const yaw of [-2.5, -FACING.yaw, 0, .8, FACING.yaw, 3]) for (const speed of [0, 13, 34]) {
    orientSuit(root, pose({ yaw, speed, pitch: -.12, viewPitch: -.12 }), hero);
    forward.set(0, 0, -1).applyQuaternion(root.quaternion);
    expect(Math.abs(angleDelta(Math.atan2(-forward.x, -forward.z), yaw))).toBeLessThan(1e-6);
  }
  // Body pitch is gated by speed, so looking up or down while hovering moves the camera, not the body.
  for (const pitch of [-1.3, 0, 1.25]) {
    orientSuit(root, pose({ speed: 0, pitch, viewPitch: pitch }), hero);
    expect(up.set(0, 1, 0).applyQuaternion(root.quaternion).y).toBeGreaterThan(.999);
  }
});
test('braking hard out of a climb never swings the chest toward a camera below', () => {
  const root = new Group(), back = new Vector3(), toCamera = new Vector3(), q = new Euler(0, 0, 0, 'YXZ'), head = new Vector3(0, .65, 0);
  // CHASE_BOOM, and CameraRig's nearer, lower hip boom on a phone in landscape.
  for (const boom of [CHASE_BOOM, boomFor(0, 852 / 393, { x: 0, y: 0, z: 0 }, 1)])
  for (const viewPitch of [0, .6, 1.25]) for (const drag of [.9, .96]) for (const reduced of [false, true]) for (const turn of [0, 1.2]) {
    const p = pose({ speed: 0, flight: 0 }); p.viewPitch = viewPitch; p.pitch = viewPitch;
    let speed = 34, yaw = 0, worst = 1;
    for (let frame = 0; frame < 270; frame++) {
      if (frame >= 90) speed *= drag;
      yaw += turn / 60;
      const velocity = { x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed };
      advanceFlightPose(p, { yaw, pitch: viewPitch, speed, velocity, flying: true, reduced }, 1 / 60);
      orientSuit(root, p, hero);
      back.set(0, 0, 1).applyQuaternion(root.quaternion);
      toCamera.set(boom.x, boom.y, boom.z).applyEuler(q.set(p.viewPitch, p.viewYaw, 0)).add(head).normalize();
      worst = Math.min(worst, back.dot(toCamera));
    }
    expect(worst).toBeGreaterThan(.1);
  }
});
test('the turn roll banks the whole body toward the inside of the turn as the chase camera sees it', () => {
  const root = new Group(), right = new Vector3(), up = new Vector3(), view = new Euler(0, 0, 0, 'YXZ');
  for (const viewPitch of [-.12, 0, .5]) for (const reach of [ROLL.classic, ROLL.hero]) for (const sign of [1, -1]) {
    const p = pose({ viewPitch, pitch: viewPitch });
    orientSuit(root, p, hero, sign * reach, 1);
    up.set(0, 1, 0).applyEuler(view.set(viewPitch, 0, 0));
    // A left roll (positive) raises the right shoulder on screen; a right roll lowers it.
    expect(right.set(1, 0, 0).applyQuaternion(root.quaternion).dot(up) * sign).toBeGreaterThan(.45);
  }
  // With the speed fade full, the hover side tilt has handed over to the roll: without a roll nothing tips the body sideways.
  for (const speed of [8, 13, 34]) {
    orientSuit(root, pose({ bank: .3, speed }), hero, 0, 1); expect(Math.abs(right.set(1, 0, 0).applyQuaternion(root.quaternion).y)).toBeLessThan(1e-9);
  }
  // Hovering, and on foot, it still tilts.
  orientSuit(root, pose({ bank: .3, speed: 0 }), hero, 0, 0); expect(right.set(1, 0, 0).applyQuaternion(root.quaternion).y).toBeGreaterThan(.25);
  orientSuit(root, pose({ bank: .3, speed: 5, flight: 0 }), hero, 0, 1); expect(right.set(1, 0, 0).applyQuaternion(root.quaternion).y).toBeGreaterThan(.25);
});
test('the on-screen roll follows how directly the camera looks along the flight, so a steep view does not swing the heading', () => {
  const root = new Group(), right = new Vector3(), camRight = new Vector3(), camUp = new Vector3(), view = new Euler(0, 0, 0, 'YXZ');
  const shown = (viewPitch: number, roll: number) => {
    const p = pose({ viewPitch, pitch: viewPitch, speed: 13 }), angle = (r: number) => {
      orientSuit(root, p, hero, r, 1); view.set(viewPitch, 0, 0); camRight.set(1, 0, 0).applyEuler(view); camUp.set(0, 1, 0).applyEuler(view);
      right.set(1, 0, 0).applyQuaternion(root.quaternion); return Math.atan2(right.dot(camUp), right.dot(camRight));
    };
    return angle(roll) - angle(0);
  };
  const level = shown(-.12, ROLL.hero), steep = shown(-1.3, ROLL.hero);
  if (process.env.ROLL_REPORT) console.log(`on-screen roll for .8: level ${level.toFixed(3)} steep ${steep.toFixed(3)} ratio ${(steep / level).toFixed(3)}`);
  expect(level).toBeGreaterThan(.85 * ROLL.hero); expect(steep).toBeGreaterThan(0); expect(steep / level).toBeLessThan(.75);
});
test('the view weight uses the flight axis, body pitch included, when the body pitch differs from the view', () => {
  const root = new Group(), right = new Vector3(), camRight = new Vector3(), camUp = new Vector3(), view = new Euler(0, 0, 0, 'YXZ'), sight = new Vector3();
  const shown = (p: Pose) => {
    const angle = (r: number) => {
      orientSuit(root, p, hero, r, 1); view.set(p.viewPitch, 0, 0); camRight.set(1, 0, 0).applyEuler(view); camUp.set(0, 1, 0).applyEuler(view);
      right.set(1, 0, 0).applyQuaternion(root.quaternion); return Math.atan2(right.dot(camUp), right.dot(camRight));
    };
    return angle(ROLL.hero) - angle(0);
  };
  // t̂·ĉ computed apart from orientSuit: the flight axis (yaw, pitch × power) against the line to the camera.
  const weight = (p: Pose) => { const e = p.pitch * p.power; sightLine(p, sight); return Math.cos(e) * sight.z - Math.sin(e) * sight.y; };
  const level = pose({ viewPitch: -.12, pitch: -.12 }), lines: string[] = [];
  // A dive with the camera above, and a climb with the camera below, each with the body pitched off the view.
  for (const [viewPitch, pitch] of [[-.8, -.95], [-.8, -.8], [-1.1, -1.25], [.5, .9], [1, 1.4]]) {
    const p = pose({ viewPitch, pitch }), measured = shown(p) / shown(level), expected = weight(p) / weight(level);
    lines.push(`view ${viewPitch} body ${pitch}: ${measured.toFixed(3)} against ${expected.toFixed(3)}`);
    expect(Math.abs(measured - expected), lines.at(-1)).toBeLessThan(.03);
  }
  if (process.env.ROLL_REPORT) console.log(`on-screen roll over level, measured against t̂·ĉ: ${lines.join(' · ')}`);
});
test('motion blending converges consistently across refresh rates and classic remains available', () => {
  const results = [30, 60, 120].map(hz => {
    const motion = { hero: 0, epoch: 0 };
    for (let i = 0; i < hz * 2; i++) advanceSuitMotion(motion, true, 1 / hz);
    return motion;
  });
  expect(results[0].hero).toBeCloseTo(results[2].hero, 6);
  const rig = joints(); applySuitPose(rig, pose(), { hero: 0, epoch: 0 }, false);
  expect(rig[3].rotation.x).toBeCloseTo(.18); expect(rig[6].rotation.x).toBeCloseTo(0);
});
test('extreme flight states keep finite bounded joints; reduced motion removes turn flourishes', () => {
  const rig = joints();
  for (const bank of [-.3, 0, .3]) for (const brake of [0, .5, 1]) {
    const p = pose({ bank, brake }); const original = { ...p };
    applySuitPose(rig, p, hero, false);
    expect(p).toEqual(original);
  }
  applySuitPose(rig, pose({ bank: .3 }), hero, true);
  expect(rig[0].rotation.y).toBe(0); expect(rig[1].rotation.y).toBe(0);
});
test('actual forearm and shin joints stay connected when their parent limbs move', async () => {
  const asset = await loadSuit();
  const rig = buildSuitRig(asset.scene);
  try {
    for (const [child, parent] of [[6, 2], [7, 3], [8, 4], [9, 5]]) {
      expect(rig.joints[child].parent).toBe(rig.joints[parent]);
      const length = rig.joints[child].position.length();
      applySuitPose(rig.joints, pose({ brake: 1 }), hero, false);
      rig.root.updateMatrixWorld(true);
      const distance = rig.joints[child].getWorldPosition(new Vector3()).distanceTo(rig.joints[parent].getWorldPosition(new Vector3()));
      expect(distance).toBeCloseTo(length, 8);
    }
  } finally { rig.dispose(); }
});
