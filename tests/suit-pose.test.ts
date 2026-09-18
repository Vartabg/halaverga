import { expect, test } from 'vitest';
import { Euler, Group, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { applySuitPose, advanceSuitMotion, orientSuit } from '../src/world/suitPose';
import { buildSuitRig } from '../src/world/suitRig';
import { CHASE_BOOM, FACING, type Pose } from '../src/game/presentation';
const pose = (patch: Partial<Pose> = {}): Pose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: -1.35, bank: 0, speed: 34, flight: 1, brake: 0, ...patch });
const joints = () => Array.from({ length: 10 }, () => new Group());
const hero = { hero: 1, epoch: 0 };
const states = [pose({ speed: 0, lean: 0 }), pose({ speed: 13, lean: -.54 }), pose(), pose({ bank: .3 }), pose({ bank: -.3, pitch: -1 }),
  pose({ speed: 10, lean: -.2, brake: 1 }), pose({ pitch: 1.2, viewPitch: 1.2 }), pose({ speed: 0, flight: 0, lean: 0 })];
test('power flight leads with the right fist along the travel axis and trails the left arm; braking lifts the left knee', () => {
  const rig = joints();
  applySuitPose(rig, pose(), hero, false);
  expect(rig[3].rotation.x).toBeGreaterThan(2.5); expect(rig[2].rotation.x).toBeLessThan(0);
  applySuitPose(rig, pose({ brake: 1, speed: 10, lean: -.2 }), hero, false);
  expect(rig[8].rotation.x).toBeLessThan(-1);
  expect(rig[4].rotation.x).toBeGreaterThan(rig[5].rotation.x);
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
test('the back faces the chase camera for every view pitch, bounded body pitch, bank and speed', () => {
  const root = new Group(), back = new Vector3(), toCamera = new Vector3(), q = new Euler(0, 0, 0, 'YXZ');
  for (const viewPitch of [-1.3, -.8, -.12, 0, .5, 1, 1.25]) for (const offset of [-FACING.pitchDown, 0, FACING.pitchUp])
    for (const bank of [-.3, 0, .3]) for (const speed of [0, 8, 13, 34]) for (const yaw of [-FACING.yaw, 0, FACING.yaw]) for (const h of [0, 1]) {
      const streamline = Math.min(1, Math.max(0, (speed - 3) / 25));
      orientSuit(root, pose({ viewPitch, pitch: viewPitch + offset, bank, speed, yaw, lean: -1.35 * streamline }), { hero: h, epoch: 0 });
      back.set(0, 0, 1).applyQuaternion(root.quaternion);
      toCamera.copy(CHASE_BOOM).applyEuler(q.set(viewPitch, 0, 0)).add(new Vector3(0, .65, 0)).normalize();
      // The back side always faces the camera, including a steep climbing turn where yaw, pitch and roll all lag.
      expect(back.dot(toCamera)).toBeGreaterThan(bank === 0 && yaw === 0 ? .1 : .05);
    }
});
test('banking rolls around the travel axis toward the inside of the turn instead of swinging the torso', () => {
  const root = new Group(), head = new Vector3(), right = new Vector3();
  orientSuit(root, pose({ bank: .3 }), hero);
  head.set(0, 1, 0).applyQuaternion(root.quaternion); right.set(1, 0, 0).applyQuaternion(root.quaternion);
  expect(Math.abs(head.x)).toBeLessThan(.05); expect(head.z).toBeLessThan(-.9);
  expect(right.y).toBeGreaterThan(.25);
  orientSuit(root, pose({ bank: -.3 }), hero); right.set(1, 0, 0).applyQuaternion(root.quaternion);
  expect(right.y).toBeLessThan(-.25);
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
