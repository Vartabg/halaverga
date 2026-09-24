import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Euler, PerspectiveCamera, Vector3, type Object3D } from 'three';
import type { ShotEvent } from '../src/game/combat';
import { shooterFaulted } from '../src/game/shooterFault';
import { tracerOrigin, type TracerOrigin } from '../src/world/fxPools';
import { MUZZLE, NODES, cannonDrive, cannonLink } from '../src/world/cannonContract';
import { CH } from '../src/world/shotSprings';
import { createHarness, loadAssets, settle } from './blaster-harness';

/** The solved (pre-kick) muzzle, captured when the post-solve kick layer starts: the gameplay muzzle must equal it. */
const solved = { x: NaN, y: NaN, z: NaN, calls: 0 };
vi.mock('../src/world/shotBodyPose', async importOriginal => {
  const real = await importOriginal<typeof import('../src/world/shotBodyPose')>();
  return { ...real, applyShotBodyPost: (joints: Object3D[], b: Parameters<typeof real.applyShotBodyPost>[1]) => {
    const p = joints[7].localToWorld(new Vector3(MUZZLE.x, MUZZLE.y, MUZZLE.z)); solved.x = p.x; solved.y = p.y; solved.z = p.z; solved.calls++;
    real.applyShotBodyPost(joints, b);
  } };
});
let assets: Awaited<ReturnType<typeof loadAssets>>;
beforeAll(async () => { assets = await loadAssets(); });
const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
const DEG = Math.PI / 180, W = 393, H = 852, cam = new PerspectiveCamera(65, W / H, .1, 500);
/** Screen y (CSS px, down) of the effects muzzle from the harness's chase camera at iPhone portrait. */
function muzzleY(h: ReturnType<typeof createHarness>) {
  const a = h.s.aim; cam.position.set(a.origin.x, a.origin.y, a.origin.z); cam.quaternion.setFromEuler(new Euler(h.viewPitch, h.viewYaw, 0, 'YXZ'));
  cam.updateMatrixWorld(true);
  return (1 - v(cannonLink.fxMuzzle).project(cam).y) / 2 * H;
}
describe('one shot clock: every channel starts on the press frame', () => {
  it.each([[60, .8, true], [120, .8, true], [30, .65, false]] as const)('at %i Hz from carry', (hz, elbowMin, slideTested) => {
    const dips: number[] = [];
    for (const stance of ['ground', 'hover'] as const) {
      const h = createHarness(assets, stance, hz), b = h.f.blaster;
      b.body.vary = 0;
      h.viewPitch = .1; settle(h, 1.5);
      expect(cannonLink.handHidden).toBe(true); expect(b.aim.carry).toBe(1); expect(b.aim.weight).toBe(0);
      const serial = h.s.eventSerial, carryY = muzzleY(h); h.calls.length = 0;
      // Frame N: the press.
      h.step(true);
      expect(shooterFaulted()).toBe(false);
      expect(h.s.weapon.shots).toBe(1); expect(h.s.eventSerial).toBe(serial + 1);
      const e = h.s.events.find(x => x.serial === serial + 1) as ShotEvent;
      expect(['miss', 'world', 'water', 'hit', 'weak', 'kill', 'blocked']).toContain(e.kind);
      expect(h.s.camFx.kickPv).not.toBe(0); expect(h.calls).toContain('fire');
      // The tracer tail starts at the kicked effects muzzle, which is the cannon_muzzle node.
      const org: TracerOrigin = { from: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, dist: 0 };
      expect(tracerOrigin(e, h.s.clock, cannonLink.fxMuzzle, org)).toBe(true);
      const node = h.cannon.root.getObjectByName(NODES.muzzle)!.getWorldPosition(new Vector3());
      expect(cannonLink.fxMuzzle.valid).toBe(true);
      expect(v(org.from).distanceTo(v(cannonLink.fxMuzzle))).toBe(0); expect(node.distanceTo(v(cannonLink.fxMuzzle))).toBeLessThan(1e-9);
      // The press frame is part-way through the punch-out (weight .26 at 60 Hz; the bold carry rests about 33 deg off the line, so the
      // press snap does most of the swing): the barrel is within 20 deg of the line to the crosshair in 3D, and the muzzle never dips
      // more than 12 CSS px at chase portrait on the press frame (the bold carry rests the cannon a little above the line; measured
      // 2-8 px at 30-120 Hz).
      const a = h.s.aim, target = v(a.origin).addScaledVector(v(a.dir), b.aim.dist);
      expect(b.aim.swing).toBe(b.aim.weight);
      expect(v(b.barrel).angleTo(target.sub(v(h.s.muzzle))) / DEG).toBeLessThanOrEqual(20);
      const dip = muzzleY(h) - carryY; dips.push(+dip.toFixed(1)); expect(dip).toBeLessThanOrEqual(12);
      // The body and the cannon answer on the same frame.
      expect(b.body.springs.x[CH.elbow]).toBeGreaterThanOrEqual(elbowMin);
      if (slideTested) expect(cannonDrive.slide).toBeGreaterThan(0);
      expect(cannonDrive.core).toBeGreaterThan(.85);   // firing .75 plus the .15 flare (bold r5), over the .55 carry glow
      // The gameplay muzzle is the solved one; the kicked effects muzzle departs from it while the kick is live.
      expect(v(h.s.muzzle).distanceTo(v(solved))).toBeLessThan(1e-12);
      let apart = 0;
      for (let i = 0; i < Math.round(hz * .05); i++) {
        h.step(true);
        expect(v(h.s.muzzle).distanceTo(v(solved))).toBeLessThan(1e-12);
        apart = Math.max(apart, v(h.s.muzzle).distanceTo(v(cannonLink.fxMuzzle)));
      }
      expect(apart).toBeGreaterThan(.005);
      h.step(false);
    }
    console.info(`press-frame muzzle dip at ${hz} Hz (CSS px, ground, hover):`, dips.join(', '));
  }, 60000);
});
