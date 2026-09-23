// Per-shot recoil springs for the arm cannon choreography. Each channel is an exact damped spring (springStep) that a shot kicks so
// its single-shot peak is exactly 1: the pose layer multiplies the value by its angle. Snap channels (the cannon and the arm) jump
// by their gain on the frame the shot is seen, after that frame's integration, so the recoil peaks ON the shot frame at any rate and
// then springs back (visual review r3: a velocity kick peaked 1-4 frames late and hid inside the unfold from carry). Exact channels
// (the body) get a velocity impulse at the shot's exact time plus a delay, so the kick travels outward identically at any frame
// rate. Float64Array state and a fixed pending ring: no allocation after createShotSprings().
import { springStep } from '../game/combat';

export const CH = { slide: 0, elbow: 1, shoulder: 2, shoulderYaw: 3, clav: 4, torso: 5, offArm: 6, head: 7, hoverPitch: 8, legTrail: 9 } as const;
export type ChannelName = keyof typeof CH;
export type Channel = { readonly name: ChannelName; readonly f: number; readonly z: number; readonly delay: number; readonly exact: boolean;
  /** Angular frequency (rad/s) and the velocity impulse that peaks an at-rest spring at 1 (exact channels). */ readonly w: number; readonly impulse: number };
/** Velocity impulse per unit peak: the impulse response of x'' = -w^2 x - 2 z w x' peaks at (v / w) e^(-z acos z / sqrt(1 - z^2)). */
export const impulseFor = (w: number, z: number) => w * Math.exp(z * Math.acos(z) / Math.sqrt(1 - z * z));
const row = (name: ChannelName, f: number, z: number, delayMs: number, exact: boolean): Channel =>
  ({ name, f, z, delay: delayMs / 1000, exact, w: 2 * Math.PI * f, impulse: impulseFor(2 * Math.PI * f, z) });
/** Snap channels return below 5% of the peak in 53 (slide), 98 (elbow) and 133 ms (shoulder, yaw, clavicle), with <= 2.4% undershoot. */
export const CHANNELS: readonly Channel[] = [
  row('slide', 9, .75, 0, false), row('elbow', 5, .75, 0, false), row('shoulder', 4, .8, 0, false), row('shoulderYaw', 4, .8, 0, false),
  row('clav', 4, .8, 0, false), row('torso', 4, .7, 30, true), row('offArm', 3, .7, 40, true), row('head', 3.5, .7, 60, true),
  row('hoverPitch', 2.2, .7, 20, true), row('legTrail', 1.8, .55, 80, true),
];
export const CHANNEL_COUNT = CHANNELS.length, PENDING = 6;
/** Analytic time of the single-shot peak (s), delay included; 0 for a snap channel (it peaks on the shot frame). */
export const peakTime = (c: Channel) => c.exact ? c.delay + Math.acos(c.z) / (c.w * Math.sqrt(1 - c.z * c.z)) : 0;
/** x, v per channel; per channel a ring of PENDING (time, signed gain) impulses, count in pn. */
export type ShotSprings = { x: Float64Array; v: Float64Array; pt: Float64Array; pg: Float64Array; pn: Uint8Array };
export const createShotSprings = (): ShotSprings => ({ x: new Float64Array(CHANNEL_COUNT), v: new Float64Array(CHANNEL_COUNT),
  pt: new Float64Array(CHANNEL_COUNT * PENDING), pg: new Float64Array(CHANNEL_COUNT * PENDING), pn: new Uint8Array(CHANNEL_COUNT) });
export function restShotSprings(s: ShotSprings) { s.x.fill(0); s.v.fill(0); s.pn.fill(0); }
/** True when every channel is exactly 0 and nothing is pending. */
export function springsAtRest(s: ShotSprings) {
  for (let c = 0; c < CHANNEL_COUNT; c++) if (s.x[c] !== 0 || s.v[c] !== 0 || s.pn[c] !== 0) return false;
  return true;
}
/** Velocity kick now: the channel's velocity jumps by gain (signed) units of peak (exact channels, when their time comes). */
export function kickNow(s: ShotSprings, c: number, gain: number) { s.v[c] += CHANNELS[c].impulse * gain; }
/** Snap kick: the channel's value jumps by gain (signed) units of peak. Call after this frame's advanceShotSprings. */
export function snapKick(s: ShotSprings, c: number, gain: number) { s.x[c] += gain; }

const step = { x: 0, v: 0 };
function integrate(s: ShotSprings, c: number, dt: number) {
  if (!(dt > 0) || (s.x[c] === 0 && s.v[c] === 0)) return;
  const ch = CHANNELS[c];
  springStep(s.x[c], s.v[c], ch.w, ch.z, dt, step); s.x[c] = step.x; s.v[c] = step.v;
}
/** Removes pending entry k of channel c (order is not kept; the ring is scanned for the earliest). */
function drop(s: ShotSprings, c: number, k: number) {
  const last = c * PENDING + --s.pn[c], at = c * PENDING + k;
  s.pt[at] = s.pt[last]; s.pg[at] = s.pg[last];
}
function earliest(s: ShotSprings, c: number) {
  let best = -1;
  for (let k = 0; k < s.pn[c]; k++) if (best < 0 || s.pt[c * PENDING + k] < s.pt[c * PENDING + best]) best = k;
  return best;
}
/** Exact kick: queued for `time` (the shot time plus the channel delay is added here). A full ring fires its earliest entry now. */
export function queueKick(s: ShotSprings, c: number, shotTime: number, gain: number) {
  if (s.pn[c] >= PENDING) { const k = earliest(s, c); kickNow(s, c, s.pg[c * PENDING + k]); drop(s, c, k); }
  const at = c * PENDING + s.pn[c]++;
  s.pt[at] = shotTime + CHANNELS[c].delay; s.pg[at] = gain;
}
/**
 * Advances the body clock from t0 to t1. Snap channels integrate dt (their kicks land after this call).
 * Exact channels integrate t0 -> t1 split at every pending time in (t0, t1]; late entries (at or before t0) fire at t0; later ones wait.
 */
export function advanceShotSprings(s: ShotSprings, t0: number, t1: number) {
  for (let c = 0; c < CHANNEL_COUNT; c++) {
    if (!CHANNELS[c].exact) { integrate(s, c, t1 - t0); settle(s, c); continue; }
    let t = t0;
    for (let k = earliest(s, c); k >= 0 && s.pt[c * PENDING + k] <= t1; k = earliest(s, c)) {
      const at = Math.max(t, s.pt[c * PENDING + k]);
      integrate(s, c, at - t); t = at;
      kickNow(s, c, s.pg[c * PENDING + k]); drop(s, c, k);
    }
    integrate(s, c, t1 - t); settle(s, c);
  }
}
/** Snaps a channel to exact rest once it is invisible (|x| < 1e-5 peak, |v| < 1e-4 peak/s). */
function settle(s: ShotSprings, c: number) {
  if (Math.abs(s.x[c]) < 1e-5 && Math.abs(s.v[c]) < 1e-4) { s.x[c] = 0; s.v[c] = 0; }
}
