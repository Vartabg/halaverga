import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quaternion, SkinnedMesh, Vector3 } from 'three';
import { createDemonActors, type DemonPose } from '../src/world/demonActors';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { SWORD_GRIP } from '../src/world/swordGrip';
import { EYE_FORWARD, EYE_RADIUS, EYE_UP } from '../src/game/combat';
import { loadSuit } from './load-suit';
let asset: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { asset = await loadSuit('watcher'); });
const at = new Vector3(5, 9, -3), rotation = new Quaternion();
const state = (time = 1): DemonPose => ({ time, charging: false, down: false, hit: 0, reduced: false, damage: 0 });
describe('the Watcher (watcher.glb) in the actual game rig', () => {
 it('ships weighted surfaces, every game clip, the breakable cuirass and a bounded model', () => {
  expect(readFileSync(new URL('../public/models/watcher.glb', import.meta.url)).length).toBeLessThan(2_500_000);
  expect(asset.animations.map(a => a.name).sort()).toEqual(
    ['block', 'charge', 'cut0', 'cut1', 'cut2', 'down', 'flight', 'hit', 'hitHead', 'idle', 'knock', 'rush', 'swordIdle']);
  const pool = createDemonActors(asset.scene, asset.animations);
  expect(pool.actors[0].joints.map(j => j.name)).toEqual(BONE_NAMES);
  expect(pool.actors[0].plate).toBeDefined();
  let triangles = 0, meshes = 0;
  pool.actors[0].root.traverse(o => { if (o instanceof SkinnedMesh) { meshes++; triangles += o.geometry.index!.count / 3; } });
  expect(triangles).toBeGreaterThan(15000); expect(triangles).toBeLessThan(26000); expect(meshes).toBeLessThanOrEqual(6); pool.dispose();
 });
 it('plays charge and hit reactions independently for each enemy without moving the combat root', () => {
  const pool = createDemonActors(asset.scene, asset.animations);
  pool.step(0, at, rotation, true, state()); const idle = pool.actors[0].joints[3].quaternion.clone();
  pool.step(1, at, rotation, true, { ...state(), charging: true });
  expect(pool.actors[1].joints[3].quaternion.angleTo(idle)).toBeGreaterThan(.1);
  expect(pool.actors[0].root.position).toEqual(at);
  pool.step(0, at, rotation, true, { ...state(), hit: .8 });
  expect(pool.actors[0].materials[0].emissive.r).toBeGreaterThan(0);
  pool.dispose();
 });
 it('keeps the wings on the animated chest, the blade in the right fist and the eye marker on the head through collapse', () => {
  const pool = createDemonActors(asset.scene, asset.animations), actor = pool.actors[0];
  const bind = new Vector3().setFromMatrixPosition(actor.chestBind.clone().invert()), grip = new Vector3(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z);
  for (let frame = 0; frame < 180; frame++) {
   pool.step(0, at, rotation, true, { ...state(frame / 60), down: true });
   expect(bind.clone().applyMatrix4(actor.wingMatrix).distanceTo(actor.joints[11].getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
   expect(new Vector3().setFromMatrixPosition(actor.bladeMatrix).distanceTo(grip.clone().applyMatrix4(actor.joints[16].matrixWorld))).toBeLessThan(1e-6);
   for (const m of [actor.wingMatrix, actor.bladeMatrix, actor.eyeMatrix]) expect(m.elements.every(Number.isFinite)).toBe(true);
  }
  pool.dispose();
 });
 it('rests the eye marker on the weak point and keeps it inside the weak-point sphere through every live reaction and warden phase', () => {
  const pool = createDemonActors(asset.scene, asset.animations), actor = pool.actors[0], origin = new Vector3(), still = new Quaternion();
  const weak = new Vector3(0, EYE_UP, -EYE_FORWARD), eye = () => new Vector3().setFromMatrixPosition(actor.eyeMatrix).distanceTo(weak);
  pool.step(0, origin, still, true, { ...state(0), reduced: true });
  expect(eye()).toBeLessThan(.06); // the hover frame (idle under flight), not the bind pose, is where the weak point was measured
  let worst = 0;
  const run = (pose: (t: number) => DemonPose) => { for (let t = 0; t < 2.4; t += 1 / 30) { pool.step(0, origin, still, true, pose(t)); worst = Math.max(worst, eye()); } };
  run(t => ({ ...state(t), charging: true }));
  // The reactions a Watcher survives standing (the casting blow's knock back throws it down: the fall takes over).
  for (const blow of [-1, 0, 1]) { pool.step(0, origin, still, true, state(0)); run(t => ({ ...state(t), hitT: t, hitSide: 1, blow })); }
  for (const [attack, move] of [[1, 2], [1, 6], [1, 3], [2, 2], [5, 5], [6, 6], [3, 3], [4, 0]]) run(t => ({ ...state(t), attack, attackTime: t, move, tell: 1.3, rush: 1 }));
  expect(worst).toBeLessThan(EYE_RADIUS * .8); // measured .237 m (2026-11-17)
  pool.dispose();
 });
 it('holds reduced-motion pose, hides dead actors and releases owned resources without disposing cached maps', () => {
  const pool = createDemonActors(asset.scene, asset.animations);
  pool.step(0, at, rotation, true, { ...state(1), reduced: true });
  const pose = pool.actors[0].joints.map(j => j.quaternion.toArray());
  pool.step(0, at, rotation, true, { ...state(10), reduced: true });
  expect(pool.actors[0].joints.map(j => j.quaternion.toArray())).toEqual(pose);
  pool.step(0, at, rotation, false, state()); expect(pool.actors[0].root.visible).toBe(false);
  let disposed = 0; pool.actors[0].root.traverse(o => { if (o instanceof SkinnedMesh) o.geometry.addEventListener('dispose', () => disposed++); });
  let cachedMapDisposed = false;
  const mapped = pool.actors[0].materials.find(m => m.map)!;
  mapped.map!.addEventListener('dispose', () => cachedMapDisposed = true);
  pool.dispose(); expect(disposed).toBeGreaterThan(0); expect(cachedMapDisposed).toBe(false);
 });
});
