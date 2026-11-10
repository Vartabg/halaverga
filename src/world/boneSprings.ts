// Spring follow-through (Garo 2026-10-19: "spring-driven body"). Every animation layer still writes its pose; this pass, run last,
// treats that pose as a target and lets each bone chase it through a damped rotational spring. Limbs, head, wings and feathers
// lag and settle at their own rate, so a change of state overlaps instead of snapping. Visual only: the camera, physics and the
// presentation pose never read it. Allocation-free per frame; fixed 1/120 s substeps keep it identical at any frame rate.
import { Quaternion, type Object3D } from 'three';

/** Natural frequency (Hz) and damping ratio (1 = no overshoot) of one bone's spring. */
export type SpringTune = readonly [hz: number, zeta: number];
const STEP = 1 / 120;
const t = new Quaternion(), c = new Quaternion(), d = new Quaternion(), dq = new Quaternion();

export function createBoneSprings(bones: readonly Object3D[], tunes: readonly SpringTune[]) {
  const n = bones.length;
  return { bones, tunes, n, q: new Float64Array(n * 4), w: new Float64Array(n * 3), target: new Float64Array(n * 4), live: false };
}
export type BoneSprings = ReturnType<typeof createBoneSprings>;

/** Puts last frame's targets back on the bones, so layers that read a bone before writing it see their own pose, not the spring's. */
export function restoreTargets(s: BoneSprings) {
  if (!s.live) return;
  for (let i = 0; i < s.n; i++) s.bones[i].quaternion.fromArray(s.target, i * 4);
}
/** Rotation vector (axis * angle) of unit quaternion q, shortest way round. */
function rotationVector(q: Quaternion, out: Float64Array) {
  const sign = q.w < 0 ? -1 : 1, x = q.x * sign, y = q.y * sign, z = q.z * sign, w = q.w * sign, s = Math.hypot(x, y, z);
  const k = s < 1e-8 ? 2 : 2 * Math.atan2(s, w) / s;
  out[0] = x * k; out[1] = y * k; out[2] = z * k;
}
const err = new Float64Array(3);
/**
 * Reads each bone's pose as its target, advances the springs by dt and writes the result. stiffness(i) scales bone i's frequency
 * (e.g. planted legs, a commanding arm); snap jumps straight to the targets (first frame, teleport, reduced motion). dt 0 holds.
 */
export function followTargets(s: BoneSprings, dt: number, snap: boolean, stiffness?: (i: number) => number) {
  const { q, w, target, bones, tunes } = s;
  for (let i = 0; i < s.n; i++) bones[i].quaternion.toArray(target, i * 4);
  if (snap || !s.live) {
    q.set(target); w.fill(0); s.live = true;
    return;
  }
  const steps = dt > 0 ? Math.min(12, Math.ceil(dt / STEP - 1e-6)) : 0, h = steps ? Math.min(dt, .1) / steps : 0;
  for (let i = 0; i < s.n; i++) {
    const o = i * 4, v = i * 3, [hz, zeta] = tunes[i], omega = 2 * Math.PI * hz * (stiffness ? stiffness(i) : 1);
    const k = omega * omega, damp = 2 * zeta * omega;
    t.fromArray(target, o); c.fromArray(q, o);
    for (let n = 0; n < steps; n++) {
      d.copy(c).invert().premultiply(t); rotationVector(d, err);
      w[v] += (k * err[0] - damp * w[v]) * h; w[v + 1] += (k * err[1] - damp * w[v + 1]) * h; w[v + 2] += (k * err[2] - damp * w[v + 2]) * h;
      const ax = w[v] * h, ay = w[v + 1] * h, az = w[v + 2] * h, angle = Math.hypot(ax, ay, az);
      if (angle > 1e-9) { const s2 = Math.sin(angle / 2) / angle; dq.set(ax * s2, ay * s2, az * s2, Math.cos(angle / 2)); c.premultiply(dq).normalize(); }
    }
    c.toArray(q, o); bones[i].quaternion.copy(c);
  }
}
