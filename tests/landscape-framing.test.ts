import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { boomFor, CAM, hipFovFor, shortWeight } from '../src/game/cameraFx';
import { pose, posed, simulate, walking } from './suit-motion-harness';
// The grounded suit as CameraRig frames it at rest (view pitch -0.12, hip, no collision), projected to CSS px. This pins the
// landscape boom's reason to exist: a bigger character whose feet stay clear of the bottom edge. Geometry, not iPhone validation.
// Extents from suit.glb's bind box (y -1.042 to 0.950): the head top is 0.275 above the head joint, the boot soles 0.532 below the
// shin joint and 0.077 below the toe joints.
const HEAD = 1, SHINS = [8, 9], TOES = [19, 20], REST_PITCH = -.12;
type Screen = { width: number; height: number };
const camera = new PerspectiveCamera(), euler = new Euler(0, 0, 0, 'YXZ');
const standing = posed(simulate(2, 60, walking(0, 0)), pose({ viewPitch: REST_PITCH, pitch: REST_PITCH }));
const points = [standing.joints[HEAD].localToWorld(new Vector3(0, .275, 0)),
  ...SHINS.map(i => standing.joints[i].localToWorld(new Vector3(0, -.532, 0))), ...TOES.map(i => standing.joints[i].localToWorld(new Vector3(0, -.077, 0)))];
/** Top of the head and lowest sole in CSS px from the top edge, for a camera with this FOV and view-frame boom. */
function project({ width, height }: Screen, fov: number, b: { x: number; y: number; z: number }, pitch: number) {
  euler.set(pitch, 0, 0);
  camera.fov = fov; camera.aspect = width / height; camera.near = .05; camera.far = 500; camera.updateProjectionMatrix();
  camera.position.set(b.x, b.y, b.z).applyEuler(euler).add(new Vector3(0, CHASE_HEAD, 0)); camera.quaternion.setFromEuler(euler);
  camera.updateMatrixWorld(true);
  const ys = points.map(p => (1 - p.clone().project(camera).y) / 2 * height);
  return { top: ys[0], feet: Math.max(...ys.slice(1)) };
}
/** CameraRig's camera for this screen: w, hip FOV and boom from cameraFx, hung from the anchor's head point. */
function frame(s: Screen, pitch = REST_PITCH) {
  const aspect = s.width / s.height, w = shortWeight(s.height, aspect), hip = hipFovFor(aspect, w), boom = boomFor(0, aspect, { x: 0, y: 0, z: 0 }, w);
  const { top, feet } = project(s, hip, boom, pitch), before = project(s, CAM.hipFov, CHASE_BOOM, pitch);
  return { w, hip, boom, clearance: s.height - feet, tall: feet - top, share: (feet - top) / s.height, gain: (feet - top) / (before.feet - before.top) };
}
const LANDSCAPE: Screen[] = [{ width: 852, height: 393 }, { width: 844, height: 390 }, { width: 932, height: 430 }, { width: 667, height: 331 }];
const PORTRAIT: Screen[] = [{ width: 393, height: 852 }, { width: 375, height: 548 }, { width: 360, height: 560 }, { width: 375, height: 667 }];
const WIDE: Screen[] = [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }, { width: 1180, height: 820 }];

describe('grounded framing at rest', () => {
  it('draws the character at 36-45% of a landscape phone height with the feet at least 12 px clear of the bottom edge', () => {
    for (const s of LANDSCAPE) {
      const f = frame(s), at = `${s.width}x${s.height}`;
      if (process.env.FRAMING_REPORT) console.log(at, f.tall.toFixed(1), (f.share * 100).toFixed(1) + '%', f.clearance.toFixed(1), f.gain.toFixed(2), frame(s, 0).clearance.toFixed(1));
      expect(f.w, at).toBe(1);
      expect(f.share, at).toBeGreaterThan(.36); expect(f.share, at).toBeLessThan(.45);
      expect(f.clearance, at).toBeGreaterThan(12);
    }
  });
  it('is at least 1.3x bigger than the old camera (65 deg, CHASE_BOOM) drew it on the same landscape screen', () => {
    for (const s of LANDSCAPE) expect(frame(s).gain, `${s.width}x${s.height}`).toBeGreaterThan(1.3);
  });
  it('keeps the feet at least 8 px clear at a level view too', () => {
    for (const s of LANDSCAPE) expect(frame(s, 0).clearance, `${s.width}x${s.height}`).toBeGreaterThan(8);
  });
  it('leaves portrait phones (small ones in Safari\'s 100svh too), tablets and desktops on CHASE_BOOM at 65 deg', () => {
    for (const s of [...PORTRAIT, ...WIDE]) {
      const f = frame(s), at = `${s.width}x${s.height}`;
      expect(f.w, at).toBe(0); expect(f.hip, at).toBe(65); expect(f.boom, at).toEqual(CHASE_BOOM);
    }
    // The iPhone SE case the review found: 375x548 is short, but portrait, so the boom must not move at all.
    expect(boomFor(0, 375 / 548, { x: 0, y: 0, z: 0 }, shortWeight(548, 375 / 548))).toEqual(CHASE_BOOM);
  });
});
