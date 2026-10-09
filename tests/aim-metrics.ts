import { Euler, PerspectiveCamera, Quaternion, Vector2, Vector3, type Object3D } from 'three';
import { CHASE_HEAD } from '../src/game/presentation';
import { boomFor, fovFor, hipFovFor } from '../src/game/cameraFx';
import { BARREL_AXIS, MUZZLE } from '../src/world/cannonContract';
/** Geometry the aim solver is judged by: the arm cannon's barrel (forearm_r frame, cannonContract.ts) and the camera projection. */
const DEG = Math.PI / 180, FORE = 7, UPPER = 3;
/** w: CameraRig's short-viewport weight (cameraFx.shortWeight): 1 on a phone in landscape, which narrows the FOV and nears the boom. */
export type View = { name: string; blend: number; aspect: number; w?: number };
/** Hip (blend 0) and ADS (blend 1) at landscape desktop, iPhone portrait and iPhone landscape aspects, then the real phone-landscape
 * camera (w 1). Hip matters as much as ADS. The first three stay the hip views. */
export const VIEWS: View[] = [...[0, 1].flatMap(blend => [1.6, .46, 2.16].map(aspect => ({ name: `${blend ? 'ads' : 'hip'}@${aspect}`, blend, aspect }))),
  ...[0, 1].map(blend => ({ name: `${blend ? 'ads' : 'hip'}@2.16 short`, blend, aspect: 2.16, w: 1 }))];
export type Shot = { origin: Vector3; dir: Vector3; target: Vector3; view: View };
const euler = new Euler(0, 0, 0, 'YXZ');
/** The camera ray as CameraRig builds it (boomFor in the view frame, hung from the head) and the point `dist` metres along it. */
export function cameraRay(viewYaw: number, viewPitch: number, dist: number, view: View = VIEWS[0]): Shot {
  euler.set(viewPitch, viewYaw, 0);
  const b = boomFor(view.blend, view.aspect, { x: 0, y: 0, z: 0 }, view.w ?? 0);
  const origin = new Vector3(b.x, b.y, b.z).applyEuler(euler).add(new Vector3(0, CHASE_HEAD, 0)), dir = new Vector3(0, 0, -1).applyEuler(euler);
  return { origin, dir, target: origin.clone().addScaledVector(dir, dist), view };
}
/** The cannon muzzle and the unit barrel direction in world space, from the current forearm_r pose. */
export function barrel(joints: Object3D[], root: Object3D) {
  root.updateMatrixWorld(true);
  const muzzle = joints[FORE].localToWorld(new Vector3(MUZZLE.x, MUZZLE.y, MUZZLE.z));
  const dir = new Vector3(BARREL_AXIS.x, BARREL_AXIS.y, BARREL_AXIS.z).normalize().applyQuaternion(joints[FORE].getWorldQuaternion(new Quaternion()));
  return { muzzle, dir };
}
const camera = new PerspectiveCamera();
function pixel(p: Vector3, aspect: number) { const s = p.clone().project(camera); return new Vector2(s.x * aspect * 400, s.y * 400); }
/**
 * After applySuitAim, against the convergence point `dist` along the shot ray. Degrees: barrel (the barrel axis against muzzle to
 * target), screen (the barrel drawn on an 800 px tall screen against the muzzle-to-crosshair line). nearer: the muzzle projects
 * nearer the crosshair than the elbow (the cannon points into the screen centre).
 */
export function aimMetrics(joints: Object3D[], root: Object3D, shot: Shot, dist: number) {
  const { muzzle, dir } = barrel(joints, root), target = shot.origin.clone().addScaledVector(shot.dir, dist);
  const hip = hipFovFor(shot.view.aspect, shot.view.w ?? 0);
  camera.fov = fovFor(hip, shot.view.blend, false, 0, hip); camera.aspect = shot.view.aspect; camera.near = .05; camera.far = 500;
  camera.position.copy(shot.origin);
  camera.quaternion.setFromEuler(new Euler(Math.asin(shot.dir.y), Math.atan2(-shot.dir.x, -shot.dir.z), 0, 'YXZ'));
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const m = pixel(muzzle, shot.view.aspect), ahead = pixel(muzzle.clone().addScaledVector(dir, .3), shot.view.aspect).sub(m), centre = m.clone().negate();
  const elbow = pixel(joints[FORE].getWorldPosition(new Vector3()), shot.view.aspect);
  return {
    barrel: dir.angleTo(target.clone().sub(muzzle)) / DEG,
    screen: Math.abs(Math.atan2(ahead.cross(centre), ahead.dot(centre))) / DEG,
    nearer: m.length() < elbow.length(), muzzle,
    shoulder: joints[UPPER].getWorldPosition(new Vector3()),
  };
}
