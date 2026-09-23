import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Vector3, type Object3D } from 'three';
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
const DEG = Math.PI / 180;
describe('one shot clock: every channel starts on the press frame', () => {
  it.each([[60, .8, true], [120, .8, true], [30, .65, false]] as const)('at %i Hz from carry', (hz, elbowMin, slideTested) => {
    for (const stance of ['ground', 'hover'] as const) {
      const h = createHarness(assets, stance, hz), b = h.f.blaster;
      b.body.vary = 0;
      h.viewPitch = .1; settle(h, 1.5);
      expect(cannonLink.handHidden).toBe(true); expect(b.aim.carry).toBe(1); expect(b.aim.weight).toBe(0);
      const serial = h.s.eventSerial, carryY = cannonLink.fxMuzzle.y; h.calls.length = 0;
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
      // The press frame is part-way through the punch-out (weight .26 at 60 Hz, no snap from carry): the barrel is within 20 deg of
      // the line to the crosshair in 3D (measured 14.4 at 60 Hz, 17.3 at 120 Hz: the abducted carry toes the barrel outward, mostly
      // along the view line), and the muzzle already rises out of the carry with the recoil snap (no dip before the kick).
      const a = h.s.aim, target = v(a.origin).addScaledVector(v(a.dir), b.aim.dist);
      expect(b.aim.swing).toBe(b.aim.weight);
      expect(v(b.barrel).angleTo(target.sub(v(h.s.muzzle))) / DEG).toBeLessThanOrEqual(20);
      expect(cannonLink.fxMuzzle.y).toBeGreaterThan(carryY);
      // The body and the cannon answer on the same frame.
      expect(b.body.springs.x[CH.elbow]).toBeGreaterThanOrEqual(elbowMin);
      if (slideTested) expect(cannonDrive.slide).toBeGreaterThan(0);
      expect(cannonDrive.core).toBeGreaterThan(.9);
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
  }, 60000);
});
