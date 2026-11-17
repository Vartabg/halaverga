import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quaternion, SkinnedMesh, Vector3 } from 'three';
import { createDemonActors, type DemonPose } from '../src/world/demonActors';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { loadSuit } from './load-suit';
let asset: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { asset = await loadSuit('abyssal'); });
const at = new Vector3(5, 9, -3), rotation = new Quaternion();
const state = (time = 1): DemonPose => ({ time, charging: false, down: false, hit: 0, reduced: false, damage: 0 });
describe('the sculpted demon in the actual game rig', () => {
 it('ships weighted surfaces, all five clips and a bounded model', () => {
  expect(readFileSync(new URL('../public/models/abyssal.glb', import.meta.url)).length).toBeLessThan(2_500_000);
  expect(asset.animations.map(a => a.name).sort()).toEqual(['charge','down','flight','hit','idle']);
  const pool = createDemonActors(asset.scene, asset.animations);
  expect(pool.actors[0].joints.map(j => j.name)).toEqual(BONE_NAMES);
  expect(pool.actors[0].plate).toBeDefined();
  let triangles = 0;
  pool.actors[0].root.traverse(o => { if (o instanceof SkinnedMesh) triangles += o.geometry.index!.count / 3; });
  expect(triangles).toBeGreaterThan(5000); expect(triangles).toBeLessThan(15000); pool.dispose();
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
 it('keeps membrane wings attached to the animated chest through collapse', () => {
  const pool = createDemonActors(asset.scene, asset.animations), actor = pool.actors[0];
  const bind = new Vector3().setFromMatrixPosition(actor.chestBind.clone().invert());
  for (let frame = 0; frame < 180; frame++) {
   pool.step(0, at, rotation, true, { ...state(frame / 60), down: true });
   const renderedRoot = bind.clone().applyMatrix4(actor.wingMatrix);
   expect(renderedRoot.distanceTo(actor.joints[11].getWorldPosition(new Vector3()))).toBeLessThan(1e-6);
   expect(actor.wingMatrix.elements.every(Number.isFinite)).toBe(true);
  }
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
  pool.actors[0].materials[0].map!.addEventListener('dispose', () => cachedMapDisposed = true);
  pool.dispose(); expect(disposed).toBeGreaterThan(0); expect(cachedMapDisposed).toBe(false);
 });
});
