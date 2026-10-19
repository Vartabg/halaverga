import { eyeCenter } from '../src/game/adversaryPose';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Euler, Mesh, SkinnedMesh, Vector3 } from 'three';
import { createShooter, EYE_FORWARD, EYE_UP, type DroneTarget } from '../src/game/combat';
import { buildTargets } from '../src/game/drones';
import { hitDrones } from '../src/game/shotMath';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { createArchangelWings } from '../src/world/archangelWings';
import { angelRegalia } from '../src/world/angelRegalia';
import { createHarness, loadAssets, settle } from './blaster-harness';
import { loadSuit } from './load-suit';

let hero: Awaited<ReturnType<typeof loadSuit>>, demon: Awaited<ReturnType<typeof loadSuit>>;
beforeAll(async () => { [hero, demon] = await Promise.all([loadSuit('angel'), loadSuit('abyssal')]); });

describe('the actual celestial assets', () => {
  it('delivers the warrior within its 2.5 MB / 80000 triangle budget on the original 21-bone flight contract', () => {
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
    expect(triangles).toBeGreaterThan(50_000); expect(triangles).toBeLessThanOrEqual(80_000);
    expect(batches).toBeLessThanOrEqual(9); rig.dispose();
  });
  it('keeps all four layered feather batches below 30000 triangles and releases their maps with the regalia', () => {
    const rig = buildSuitRig(hero.scene), w = createArchangelWings(), r = angelRegalia(rig.root, rig.joints);
    let tris = 0, meshes = 0; const disposed = new Set<unknown>();
    w.root.traverse(o => { if (o instanceof Mesh) { meshes++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
    expect(meshes).toBe(4); expect(tris).toBeLessThan(30000); expect(tris).toBeGreaterThan(20000);
    const maps = new Set<unknown>(); rig.root.traverse(o => { if (o instanceof Mesh && !Array.isArray(o.material) && 'normalMap' in o.material) {
      for (const t of [o.material.normalMap, 'roughnessMap' in o.material ? o.material.roughnessMap : null]) {
        if (t && typeof t === 'object' && 'addEventListener' in t) { maps.add(t); (t as import('three').Texture).addEventListener('dispose', () => disposed.add(t)); }
      }
    } });
    r.dispose(); w.dispose(); rig.dispose(); expect(disposed.size).toBe(maps.size); expect(maps.size).toBe(3);
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
  it('aligns the rendered demon eyes and target centre through yaw, pitch and bank', () => {
    const eye = demon.scene.getObjectByName('eye')!; demon.scene.updateMatrixWorld(true);
    const centre = new Box3().setFromObject(eye).getCenter(new Vector3());
    expect(centre.distanceTo(new Vector3(0, EYE_UP, -EYE_FORWARD))).toBeLessThan(.002);
    const s = createShooter(), f = s.drones; f.count = 1;
    for (const [yaw, pitch, bank] of [[0, 0, 0], [1.2, .4, -.2], [-2, -.7, .3]]) {
      f.yaw[0] = yaw; f.pitch[0] = pitch; f.tiltX[0] = .13; f.tiltZ[0] = bank;
      const rendered = centre.clone().applyEuler(new Euler(f.tiltX[0] + .5 * f.pitch[0], f.yaw[0], f.tiltZ[0], 'YXZ'));
      const target = eyeCenter(f, 0, { x: 0, y: 0, z: 0 });
      expect(rendered.distanceTo(new Vector3(target.x, target.y, target.z))).toBeLessThan(.002);
      buildTargets(s); expect(s.targets[0].facing!.z).toBeCloseTo(-Math.cos(f.yaw[0]) * Math.cos(f.tiltX[0] + .5 * f.pitch[0]), 6);
    }
  });
  it('rejects a rear-facing weak point even when the shot comes down from above it', () => {
    const c = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: EYE_UP, z: -EYE_FORWARD };
    const g: DroneTarget = { c, eye, r: .9, eyeR: .32, facing: { x: 0, y: 0, z: -1 }, alive: true, los: true };
    const o = { x: 0, y: 3, z: 2 }, v = new Vector3(0, eye.y - o.y, eye.z - o.z).normalize();
    const hit = { index: -1, t: 0, weak: false }; expect(hitDrones(o, v, [g], 1, 100, hit)).toBe(true); expect(hit.weak).toBe(false);
  });
});
