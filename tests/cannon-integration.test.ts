import { beforeAll, describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, SkinnedMesh, Vector3, type Object3D } from 'three';
import { shooterFaulted } from '../src/game/shooterFault';
import { AXIS_ORIGIN, BARREL_AXIS, HAND_SCALE, MUZZLE, NODES, cannonLink } from '../src/world/cannonContract';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { createHarness, loadAssets, poseRig, settle, type Harness } from './blaster-harness';
import { cannonImage } from './load-cannon';
import { quats } from './flight-harness';
/** The five blaster units wired together on the real suit.glb and arm-cannon.glb (the pipeline Suit, Shooter and ArmCannon run). */
let assets: Awaited<ReturnType<typeof loadAssets>>;
beforeAll(async () => { assets = await loadAssets(); });
const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
const A = v(BARREL_AXIS).normalize(), O = v(AXIS_ORIGIN), HAND = 16;
const skinnedOf = (root: Object3D) => { const out: SkinnedMesh[] = []; root.traverse(o => { if (o instanceof SkinnedMesh) out.push(o); }); return out; };
/** Vertices that originally carried any hand_r weight, posed with the live (blaster) weights, in the cannon's contract frame. */
function handVertices(h: Harness) {
  const skin = h.f.blaster.skin!, out: Vector3[] = [], p = new Vector3();
  h.rig.root.updateMatrixWorld(true);
  for (const m of skin.meshes) {
    const pos = m.mesh.geometry.getAttribute('position'), oi = m.origIndex, ow = m.origWeight;
    for (let i = 0; i < pos.count; i++) {
      let hw = 0; for (let c = 0; c < 4; c++) if (oi.getComponent(i, c) === HAND) hw += ow.getComponent(i, c);
      if (hw <= 0) continue;
      p.fromBufferAttribute(pos, i); m.mesh.applyBoneTransform(i, p);
      out.push(h.cannon.root.worldToLocal(p.applyMatrix4(m.mesh.matrixWorld).clone()));
    }
  }
  return out;
}
/** Radial ray from a contract-frame point outward from the barrel axis: a hit on the shell means the point is enclosed. */
function outside(h: Harness, pts: Vector3[]) {
  const shell = h.cannon.shell, probe = new Mesh(shell.geometry, new MeshBasicMaterial({ side: DoubleSide })), ray = new Raycaster();
  probe.updateMatrixWorld(true);
  return pts.filter(p => {
    const s = p.clone().sub(O).dot(A), radial = p.clone().sub(O).addScaledVector(A, -s);
    if (radial.length() < 1e-6) radial.set(0, -.246, .969);
    ray.set(p, radial.normalize());
    return ray.intersectObject(probe, false).length === 0;
  });
}
const nodeWorld = (h: Harness, name: string) => h.cannon.root.getObjectByName(name)!.getWorldPosition(new Vector3());
describe('arm cannon on the suit', () => {
  // Measured 2026-09-23: 0 of 1186 hand vertices outside the shell in all 19 poses; 253 of 300 lens samples seen (84%).
  it('hides the hand inside the shell in carry, aim, vent and flight-extreme poses', () => {
    const check = (h: Harness, label: string) => {
      expect(shooterFaulted()).toBe(false);
      expect(cannonLink.ready).toBe(true); expect(cannonLink.handHidden).toBe(true); expect(h.cannon.root.visible).toBe(true);
      expect(h.rig.joints[HAND].scale.x).toBe(HAND_SCALE);
      const pts = handVertices(h), out = outside(h, pts);
      expect(pts.length).toBeGreaterThan(1000); expect(out.length, label).toBe(0);
    };
    for (const stance of ['ground', 'hover', 'cruise'] as const) for (const [yaw, pitch] of [[0, 0], [.6, -.5], [-.4, .6]]) {
      const h = createHarness(assets, stance); h.viewYaw = yaw; h.viewPitch = pitch; settle(h, 1);
      check(h, `${stance} carry ${yaw},${pitch}`);
      for (let i = 0; i < 20; i++) h.step(true);
      check(h, `${stance} aim ${yaw},${pitch}`);
    }
    // Vent: hold fire into the overheat, then 300 ms into the vent pose (elbow +30 deg, upper-arm roll, hatch open).
    const h = createHarness(assets, 'ground'); settle(h, 1);
    while (!h.s.weapon.lock) h.step(true);
    for (let i = 0; i < 18; i++) h.step(true);
    expect(h.f.blaster.body.v).toBeGreaterThan(.8);
    check(h, 'vent');
  }, 60000);
  it('publishes the gameplay muzzle at the cannon_muzzle node within 1 mm when nothing kicks', () => {
    for (const stance of ['ground', 'hover'] as const) for (const pitch of [-.4, 0, .3]) {
      const h = createHarness(assets, stance); h.viewPitch = pitch; settle(h, 1);
      const node = nodeWorld(h, NODES.muzzle);
      expect(h.s.muzzle.valid).toBe(true);
      expect(node.distanceTo(v(h.s.muzzle))).toBeLessThan(1e-3); expect(node.distanceTo(v(cannonLink.fxMuzzle))).toBeLessThan(1e-9);
      // The contract muzzle and the node agree (the asset's muzzle residual is 0).
      expect(h.rig.joints[7].localToWorld(v(MUZZLE)).distanceTo(node)).toBeLessThan(1e-4);
      // Aiming adds only the post-solve idle sway (.1 deg) and clavicle breathing (.3 deg): visual, a few mm at the muzzle.
      h.s.input.aim = true; for (let i = 0; i < 40; i++) h.step(false);
      expect(h.s.aim.blend).toBe(1); expect(h.s.muzzle.weight).toBe(1);
      expect(nodeWorld(h, NODES.muzzle).distanceTo(v(h.s.muzzle))).toBeLessThan(4e-3);
    }
  });
  it('shows at least 40% of the core lens to the chase camera in the solved aim pose, with the posed suit as the occluder', () => {
    const h = createHarness(assets, 'ground'); settle(h, 1);
    h.s.input.aim = true; for (let i = 0; i < 40; i++) h.step(false);
    const occluders: Mesh[] = [], ray = new Raycaster(), cam = v(h.f.camera);
    h.rig.root.updateMatrixWorld(true);
    for (const m of skinnedOf(h.rig.root)) {
      // Bake the posed surface once (live blaster weights) so every ray tests a static mesh.
      const pos = m.geometry.getAttribute('position'), baked = new Float32Array(pos.count * 3), p = new Vector3();
      for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); m.applyBoneTransform(i, p); p.applyMatrix4(m.matrixWorld).toArray(baked, i * 3); }
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(baked, 3)); if (m.geometry.index) g.setIndex(m.geometry.index);
      occluders.push(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })));
    }
    const parts = [h.cannon.shell, h.cannon.slide, h.cannon.vent];
    for (const part of parts) { const o = new Mesh(part.geometry, new MeshBasicMaterial({ side: DoubleSide })); o.matrixAutoUpdate = false; o.matrixWorld.copy(part.matrixWorld); occluders.push(o); }
    const emit = cannonImage('cannon_emit'), lens: Vector3[][] = [];
    for (const part of parts) {
      const g = part.geometry, idx = g.index!, pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      const at = (i: number) => new Vector3().fromBufferAttribute(pos, i).applyMatrix4(part.matrixWorld);
      for (let k = 0; k < idx.count; k += 3) {
        const i = idx.getX(k); if (emit[Math.floor(uv.getY(i) * 8)][Math.floor(uv.getX(i) * 8)][0] > 128) lens.push([at(i), at(idx.getX(k + 1)), at(idx.getX(k + 2))]);
      }
    }
    expect(lens.length).toBeGreaterThan(0);
    let seed = 7, seen = 0, facing = 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let k = 0; k < 300; k++) {
      const [a, b, c] = lens[Math.floor(rand() * lens.length)], [u, w] = [rand(), rand()], [x, y] = u + w > 1 ? [1 - u, 1 - w] : [u, w];
      const p = a.clone().addScaledVector(b.clone().sub(a), x).addScaledVector(c.clone().sub(a), y), toCam = cam.clone().sub(p);
      if (b.clone().sub(a).cross(c.clone().sub(a)).dot(toCam) <= 0) continue;
      facing++; const d = toCam.length(); ray.set(p.clone().addScaledVector(toCam, .001 / d), toCam.normalize()); ray.far = d;
      if (ray.intersectObjects(occluders, false).length === 0) seen++;
    }
    expect(facing).toBeGreaterThan(100);
    expect(seen / 300, `${seen} of 300 lens samples seen (${facing} facing)`).toBeGreaterThanOrEqual(.4);
  }, 60000);
  it('with the blaster off matches a shooter-off rig bit for bit, before and after a blaster session', () => {
    const off = createHarness(assets, 'ground', 60, false), base = buildSkinnedSuit(assets.suit) as unknown as Harness['rig'];
    /** Steps the harness, then poses the baseline rig with the same inputs (the harness clock before the step). */
    const both = (h: Harness, fire: boolean) => { const t = h.t; h.step(fire); const after = h.t; h.t = t; poseRig(h, base); h.t = after; };
    const script = (h: Harness, i: number) => { h.stance = i < 40 ? 'ground' : i < 80 ? 'hover' : 'cruise'; h.viewYaw = Math.sin(i / 20); h.viewPitch = .4 * Math.cos(i / 17); };
    for (let i = 0; i < 120; i++) {
      script(off, i); both(off, false);
      expect(quats(off.rig.joints as never)).toEqual(quats(base.joints as never));
      expect(cannonLink.forearm).toBeNull();
    }
    // A blaster session, then off: the original attribute objects, hand scale exactly 1, and main's joints again.
    const h = createHarness(assets, 'ground'); settle(h, 1);
    for (let i = 0; i < 30; i++) h.step(true);
    const skin = h.f.blaster.skin!;
    expect(skin.on).toBe(true);
    h.f.on = false;
    for (let i = 0; i < 120; i++) {
      script(h, i); both(h, false);
      expect(quats(h.rig.joints as never)).toEqual(quats(base.joints as never));
    }
    for (const m of skin.meshes) {
      expect(m.mesh.geometry.getAttribute('skinIndex')).toBe(m.origIndex); expect(m.mesh.geometry.getAttribute('skinWeight')).toBe(m.origWeight);
    }
    expect(h.rig.joints[HAND].scale.toArray()).toEqual([1, 1, 1]);
    expect(cannonLink.forearm).toBeNull(); expect(cannonLink.handHidden).toBe(false); expect(h.cannon.root.parent).toBeNull();
    expect(h.rig.root.position.toArray()).toEqual(base.root.position.toArray());
  });
});
