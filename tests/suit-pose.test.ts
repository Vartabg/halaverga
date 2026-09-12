import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applySuitPose, advanceSuitMotion } from '../src/world/suitPose';
import { buildSuitRig } from '../src/world/suitRig';
import type { Pose } from '../src/game/presentation';
const pose = (): Pose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, lean: -1.35, bank: 0, speed: 34, flight: 1, brake: 0 });
const joints = () => Array.from({ length: 10 }, () => new Group());
test('power flight leads with one fist and bends the trailing elbow; braking raises one knee', () => {
  const rig = joints(), p = pose(), motion = { hero: 1, climb: 0, epoch: 0 };
  applySuitPose(rig, p, motion, false);
  expect(rig[3].rotation.x).toBeLessThan(-2.5);
  expect(rig[6].rotation.x).toBeLessThan(-1);
  p.brake = 1; p.speed = 10; p.lean = -.2;
  applySuitPose(rig, p, motion, false);
  expect(rig[8].rotation.x).toBeGreaterThan(1);
  expect(rig[4].rotation.x).toBeLessThan(rig[5].rotation.x);
});
test('motion blending converges consistently across refresh rates and classic remains available', () => {
  const results = [30, 60, 120].map(hz => {
    const motion = { hero: 0, climb: 0, epoch: 0 };
    for (let i = 0; i < hz * 2; i++) advanceSuitMotion(motion, .7, true, 1 / hz);
    return motion;
  });
  expect(results[0].climb).toBeCloseTo(results[2].climb, 6);
  expect(results[0].hero).toBeCloseTo(results[2].hero, 6);
  const rig = joints(); applySuitPose(rig, pose(), { hero: 0, climb: 0, epoch: 0 }, false);
  expect(rig[3].rotation.x).toBeCloseTo(.18); expect(rig[6].rotation.x).toBeCloseTo(0);
});
test('extreme flight states keep finite bounded joints; reduced motion removes turn flourishes', () => {
  const rig = joints(), motion = { hero: 1, climb: 1, epoch: 0 };
  for (const bank of [-.3, 0, .3]) for (const brake of [0, .5, 1]) {
    const p = { ...pose(), bank, brake }; const original = { ...p };
    applySuitPose(rig, p, motion, false);
    expect(rig.every(j => [j.rotation.x, j.rotation.y, j.rotation.z].every(v => Number.isFinite(v) && Math.abs(v) <= Math.PI))).toBe(true);
    expect(p).toEqual(original);
  }
  applySuitPose(rig, { ...pose(), bank: .3 }, motion, true);
  expect(rig[0].rotation.y).toBe(0); expect(rig[1].rotation.y).toBe(0);
});
test('actual forearm and shin joints stay connected when their parent limbs move', async () => {
  const bytes = readFileSync(new URL('../public/models/suit.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const rig = buildSuitRig(asset.scene);
  try {
    for (const [child, parent] of [[6, 2], [7, 3], [8, 4], [9, 5]]) {
      expect(rig.joints[child].parent).toBe(rig.joints[parent]);
      const length = rig.joints[child].position.length();
      applySuitPose(rig.joints, { ...pose(), brake: 1 }, { hero: 1, climb: 0, epoch: 0 }, false);
      rig.root.updateMatrixWorld(true);
      const distance = rig.joints[child].getWorldPosition(new Vector3()).distanceTo(rig.joints[parent].getWorldPosition(new Vector3()));
      expect(distance).toBeCloseTo(length, 8);
    }
  } finally { rig.dispose(); }
});
