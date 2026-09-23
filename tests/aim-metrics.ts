import { Euler, PerspectiveCamera, Quaternion, SkinnedMesh, Vector2, Vector3, type Object3D } from 'three';
import { CHASE_HEAD } from '../src/game/presentation';
import { CAM, boomFor, fovFor } from '../src/game/cameraFx';
import type { Muzzle } from '../src/game/combat';
import { HAND_AXIS, MUZZLE_OFS } from '../src/world/aimPose';
/** Geometry the aim solver never computes: skinned-vertex axes, the knuckle axis and the camera projection. */
const DEG = Math.PI / 180, FORE = 7, HAND = 16, UPPER = 3;
export type View = { name: string; blend: number; aspect: number };
/** Hip (blend 0) and ADS (blend 1) at landscape desktop, iPhone portrait and iPhone landscape aspects. Hip matters as much as ADS. */
export const VIEWS: View[] = [0, 1].flatMap(blend => [1.6, .46, 2.16].map(aspect => ({ name: `${blend ? 'ads' : 'hip'}@${aspect}`, blend, aspect })));
export type Shot = { origin: Vector3; dir: Vector3; target: Vector3; view: View };
const euler = new Euler(0, 0, 0, 'YXZ');
/** The camera ray as CameraRig builds it (boomFor in the view frame, hung from the head) and the point `dist` metres along it. */
export function cameraRay(viewYaw: number, viewPitch: number, dist: number, view: View = VIEWS[0]): Shot {
  euler.set(viewPitch, viewYaw, 0);
  const b = boomFor(view.blend, view.aspect, { x: 0, y: 0, z: 0 });
  const origin = new Vector3(b.x, b.y, b.z).applyEuler(euler).add(new Vector3(0, CHASE_HEAD, 0)), dir = new Vector3(0, 0, -1).applyEuler(euler);
  return { origin, dir, target: origin.clone().addScaledVector(dir, dist), view };
}
/** Bind positions (mesh space, every bind rotation identity) of the vertices weighted over half to bone `b`, relative to `head`. */
function boneVerts(root: Object3D, b: number, head: Vector3) {
  const out: Vector3[] = [];
  root.traverse(o => {
    if (!(o instanceof SkinnedMesh)) return;
    const pos = o.geometry.getAttribute('position'), si = o.geometry.getAttribute('skinIndex'), sw = o.geometry.getAttribute('skinWeight');
    for (let v = 0; v < pos.count; v++) {
      let w = 0; for (let c = 0; c < 4; c++) if (si.getComponent(v, c) === b) w += sw.getComponent(v, c);
      if (w > .5) out.push(new Vector3().fromBufferAttribute(pos, v).sub(head));
    }
  });
  return out.sort((p, q) => q.length() - p.length());
}
const centroid = (ps: Vector3[]) => ps.reduce((s, p) => s.add(p), new Vector3()).divideScalar(ps.length);
/** Axes measured on the unposed GLB rig, in the bone bind frames (call before posing it). */
export function meshAxes(root: Object3D, joints: Object3D[]) {
  root.updateMatrixWorld(true);
  const head = (b: number) => joints[b].getWorldPosition(new Vector3());
  const fore = boneVerts(root, FORE, head(FORE)), hand = boneVerts(root, HAND, head(HAND));
  const part = (ps: Vector3[], far: boolean) => { const n = Math.ceil(ps.length * .2); return centroid(far ? ps.slice(0, n) : ps.slice(-n)); };
  const knuckles = part(hand, true);
  return {
    /** Hand head to the centroid of its farthest 20% of vertices. */
    knuckle: knuckles.clone().normalize(),
    /** Forearm head to the knuckle centroid-direction point MUZZLE_OFS, with the hand at bind. */
    limb: joints[HAND].position.clone().add(MUZZLE_OFS).normalize(),
    /** The visible forearm and hand: proximal-20% centroid to distal-20% centroid of each bone's vertices. */
    fore: part(fore, true).sub(part(fore, false)).normalize(),
    hand: knuckles.clone().sub(part(hand, false)).normalize(),
  };
}
export type Axes = ReturnType<typeof meshAxes>;
const q = new Quaternion(), camera = new PerspectiveCamera();
const angle = (a: Vector3, b: Vector3) => a.angleTo(b) / DEG;
function pixel(p: Vector3, aspect: number) { const s = p.clone().project(camera); return new Vector2(s.x * aspect * 400, s.y * 400); }
/**
 * After applySuitAim, against the convergence point `dist` along the shot ray. Degrees: limb (elbow-to-muzzle against
 * elbow-to-target), fore (the forearm's vertex axis against elbow-to-target), knuckle (the hand's knuckle axis against the limb
 * line: a straight wrist), bend (hand vertex axis against forearm vertex axis), screen (projected elbow-to-muzzle against
 * elbow-to-crosshair, on an 800 px tall screen), arm and armScreen (the same for the whole shoulder-to-muzzle line), kink (px) and
 * foreScreen (the forearm vertex axis on screen). muzzleGap (m): the published muzzle against .18 m along the knuckle axis.
 */
export function aimMetrics(joints: Object3D[], root: Object3D, shot: Shot, dist: number, muzzle: Muzzle, axes: Axes) {
  root.updateMatrixWorld(true);
  const target = shot.origin.clone().addScaledVector(shot.dir, dist), elbow = joints[FORE].getWorldPosition(new Vector3());
  const point = joints[HAND].localToWorld(HAND_AXIS.clone().multiplyScalar(.18)), toTarget = target.clone().sub(elbow);
  const qf = joints[FORE].getWorldQuaternion(new Quaternion()), qh = joints[HAND].getWorldQuaternion(q);
  const fore = axes.fore.clone().applyQuaternion(qf), limb = point.clone().sub(elbow);
  camera.fov = fovFor(CAM.hipFov, shot.view.blend, false, 0); camera.aspect = shot.view.aspect; camera.near = .05; camera.far = 500;
  camera.position.copy(shot.origin);
  camera.quaternion.copy(new Quaternion().setFromEuler(new Euler(Math.asin(shot.dir.y), Math.atan2(-shot.dir.x, -shot.dir.z), 0, 'YXZ')));
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const e = pixel(elbow, shot.view.aspect), m = pixel(point, shot.view.aspect), arm = m.clone().sub(e), aimLine = e.clone().negate();
  const shoulder = joints[UPPER].getWorldPosition(new Vector3()), sp = pixel(shoulder, shot.view.aspect), whole = m.clone().sub(sp);
  return {
    limb: angle(limb, toTarget), fore: angle(fore, toTarget), knuckle: angle(HAND_AXIS.clone().applyQuaternion(qh), limb),
    bend: angle(axes.hand.clone().applyQuaternion(qh), fore), screen: Math.abs(Math.atan2(arm.cross(aimLine), arm.dot(aimLine))) / DEG,
    /** The whole arm: shoulder-to-muzzle against shoulder-to-target (deg), and the same line on screen against the crosshair. */
    arm: angle(point.clone().sub(shoulder), target.clone().sub(shoulder)),
    armScreen: Math.abs(Math.atan2(whole.cross(sp.clone().negate()), whole.dot(sp.clone().negate()))) / DEG,
    /** Pixels the elbow sits off the drawn shoulder-to-muzzle line: how far the arm visibly kinks. */
    kink: Math.abs(whole.clone().normalize().cross(e.clone().sub(sp))),
    foreScreen: (() => { const f = pixel(elbow.clone().addScaledVector(fore, .2), shot.view.aspect).sub(e); return Math.abs(Math.atan2(f.cross(aimLine), f.dot(aimLine))) / DEG; })(),
    nearer: m.length() < e.length(), muzzleGap: point.distanceTo(new Vector3(muzzle.x, muzzle.y, muzzle.z)),
    elbowBend: angle(joints[HAND].position.clone().applyQuaternion(qf), elbow.clone().sub(joints[UPPER].getWorldPosition(new Vector3()))),
  };
}
