import { eyeCenter } from '../src/game/adversaryPose';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, DataTexture, Euler, Mesh, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { createShooter, EYE_FORWARD, EYE_UP, type DroneTarget } from '../src/game/combat';
import { buildTargets } from '../src/game/drones';
import { hitDrones } from '../src/game/shotMath';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { createArchangelWings } from '../src/world/archangelWings';
import { angelRegalia } from '../src/world/angelRegalia';
import { createHarness, loadAssets, settle } from './blaster-harness';
import { createDemonActors } from '../src/world/demonActors';
import { EYE_MARKER } from '../src/world/watcherGeometry';
import { loadSuit } from './load-suit';

let hero: Awaited<ReturnType<typeof loadSuit>>, demon: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { [hero, demon] = await Promise.all([loadSuit('angel'), loadSuit('watcher')]); });

describe('the actual celestial assets', () => {
  it('delivers the warrior within its 2.5 MB / 80000 triangle budget on the original 21-bone flight contract', () => {
    // 2026-10-20: the Quaternius CC0 angel (scripts/angel_asset) replaced the 78,000-triangle procedural warrior; it is lighter.
    expect(readFileSync(new URL('../public/models/angel.glb', import.meta.url)).length).toBeLessThan(2_500_000);
    const rig = buildSuitRig(hero.scene); let triangles = 0, batches = 0;
    expect(rig.joints.map(j => j.name)).toEqual(BONE_NAMES);
    rig.root.traverse(o => { if (o instanceof SkinnedMesh) {
      batches++; const g = o.geometry; triangles += (g.index?.count ?? g.attributes.position.count) / 3;
      for (let i = 0; i < g.attributes.skinWeight.count; i++) {
        const a = g.attributes.skinWeight;
        expect(a.getX(i) + a.getY(i) + a.getZ(i) + a.getW(i)).toBeCloseTo(1, 5);
      }
    } });
    expect(triangles).toBeGreaterThan(20_000); expect(triangles).toBeLessThanOrEqual(80_000);
    expect(batches).toBeLessThanOrEqual(9); rig.dispose();
  });
  it('keeps both skinned feather batches below 30000 triangles and releases the maps the regalia made', () => {
    const rig = buildSuitRig(hero.scene), w = createArchangelWings(), r = angelRegalia(rig.root, rig.joints);
    let tris = 0, meshes = 0; const disposed = new Set<unknown>();
    w.root.traverse(o => { if (o instanceof Mesh) { meshes++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
    expect(meshes).toBe(2); expect(tris).toBeLessThan(30000); expect(tris).toBeGreaterThan(20000);
    const maps = new Set<unknown>(); rig.root.traverse(o => { if (o instanceof Mesh && !Array.isArray(o.material) && 'normalMap' in o.material) {
      for (const t of [o.material.normalMap, 'roughnessMap' in o.material ? o.material.roughnessMap : null]) {
        if (t && typeof t === 'object' && 'addEventListener' in t) { maps.add(t); (t as import('three').Texture).addEventListener('dispose', () => disposed.add(t)); }
      }
    } });
    // The regalia's procedural surface maps are its own to release; the GLB's painted maps belong to the loader cache.
    const made = [...maps].filter(t => t instanceof DataTexture);
    r.dispose(); w.dispose(); rig.dispose(); expect(maps.size).toBeGreaterThan(made.length);
    for (const t of made) expect(disposed.has(t)).toBe(true);
  });
  it('casts with the new fitted model without losing its anatomical skin treatment or breaking the muzzle', async () => {
    const assets = await loadAssets(), h = createHarness({ ...assets, suit: hero.scene }, 'hover');
    settle(h); for (let i = 0; i < 90; i++) h.step(true);
    expect(h.s.weapon.shots).toBeGreaterThan(2); expect(h.s.muzzle.valid).toBe(true);
    expect(h.f.blaster.skin!.changed.hand).toBeGreaterThan(0);
    h.rig.root.traverse(o => { if (o instanceof SkinnedMesh) for (let i = 0; i < o.geometry.attributes.position.count; i += 79) {
      const v = o.getVertexPosition(i, new Vector3()); expect(v.length()).toBeLessThan(3); expect(v.toArray().every(Number.isFinite)).toBe(true);
    } });
  });
  it('aligns the rendered Watcher eyes and target centre through yaw, pitch and bank', () => {
    // The marker is bound at watcher.glb's own eyes (the face mesh's centre in the bind pose) and rides the head; the weak point is
    // where those eyes are in the hover pose (combat.ts EYE_UP / EYE_FORWARD).
    const face: Vector3[] = []; demon.scene.updateMatrixWorld(true);
    demon.scene.traverse(o => { if (o instanceof SkinnedMesh && (o.material as { name: string }).name === 'watcher face') {
      const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) face.push(new Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    } });
    expect(new Box3().setFromPoints(face).getCenter(new Vector3()).distanceTo(new Vector3(...EYE_MARKER.centre))).toBeLessThan(.002);
    const pool = createDemonActors(demon.scene, demon.animations), at = new Vector3(), q = new Quaternion();
    const s = createShooter(), f = s.drones; f.count = 1;
    for (const [yaw, pitch, bank] of [[0, 0, 0], [1.2, .4, -.2], [-2, -.7, .3]]) {
      f.yaw[0] = yaw; f.pitch[0] = pitch; f.tiltX[0] = .13; f.tiltZ[0] = bank;
      q.setFromEuler(new Euler(f.tiltX[0] + .5 * f.pitch[0], f.yaw[0], f.tiltZ[0], 'YXZ'));
      pool.step(0, at, q, true, { time: 0, charging: false, hit: 0, down: false, reduced: true, damage: 0 }); // the hover frame
      const rendered = new Vector3().setFromMatrixPosition(pool.actors[0].eyeMatrix), target = eyeCenter(f, 0, { x: 0, y: 0, z: 0 });
      expect(rendered.distanceTo(new Vector3(target.x, target.y, target.z))).toBeLessThan(.06);
      buildTargets(s); expect(s.targets[0].facing!.z).toBeCloseTo(-Math.cos(f.yaw[0]) * Math.cos(f.tiltX[0] + .5 * f.pitch[0]), 6);
    }
    pool.dispose();
  });
  it('rejects a rear-facing weak point even when the shot comes down from above it', () => {
    const c = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: EYE_UP, z: -EYE_FORWARD };
    const g: DroneTarget = { c, eye, r: .9, eyeR: .32, facing: { x: 0, y: 0, z: -1 }, alive: true, los: true };
    const o = { x: 0, y: 3, z: 2 }, v = new Vector3(0, eye.y - o.y, eye.z - o.z).normalize();
    const hit = { index: -1, t: 0, weak: false }; expect(hitDrones(o, v, [g], 1, 100, hit)).toBe(true); expect(hit.weak).toBe(false);
  });
});
