// Camera feel for the shooter (pure, landing-safe): recoil kick, FOV punches, kill shake, ADS blend, ADS FOV and boom.
// Every channel returns to exactly 0 at rest, so an idle shooter leaves the camera bit-identical to main. No allocation.
import { ADS_GAIN, SNAP, springStep, type CamFx, type Vec3 } from './combat';
import { CHASE_BOOM } from './presentation';

export const CAM = { kickW: 10, kickZ: .6, shotW: 30, shotZ: .7, killW: 2 * Math.PI * 3, killZ: .8, shotMax: 1, traumaDecay: 1,
  shakeDeg: 2.5, shakeHz: 15, adsIn: 20, adsOut: 14, adsFovDrop: 15, hipFov: 65, fovRate: 3,
  hCap: 95, shortFrom: 440, shortTo: 600, wideFrom: 1.2, wideTo: 1.5, near: .12, hipDrop: .2, adsDrop: .1 } as const;
const DEG = Math.PI / 180, TAN25 = Math.tan(25 * DEG);
const clampDt = (elapsed: number) => elapsed > 0 ? Math.min(elapsed, .05) : 0;

/** Peak of a spring released from rest with unit velocity: impulse = peak / peakFactor. */
export function peakFactor(w: number, z: number) {
  const r = Math.sqrt(1 - z * z);
  return Math.exp(-z * Math.atan(r / z) / r) / w;
}
const KICK_PF = peakFactor(CAM.kickW, CAM.kickZ), SHOT_PF = peakFactor(CAM.shotW, CAM.shotZ), KILL_PF = peakFactor(CAM.killW, CAM.killZ);

/** Recoil impulse whose visible peak equals the given angles (deg). Positive pitch looks up. */
export function kick(fx: CamFx, pitchDeg: number, yawDeg: number) {
  fx.kickPv += pitchDeg * DEG / KICK_PF; fx.kickYv += yawDeg * DEG / KICK_PF;
}
/** FOV punch (deg). A shot punch never pushes the predicted peak above CAM.shotMax. */
export function punchFov(fx: CamFx, which: 'shot' | 'kill', peakDeg: number) {
  if (which === 'kill') { fx.fovKillV += peakDeg / KILL_PF; return; }
  const cap = (CAM.shotMax - fx.fovShot) / SHOT_PF;
  fx.fovShotV = Math.min(fx.fovShotV + peakDeg / SHOT_PF, Math.max(fx.fovShotV, cap));
}
export function addTrauma(fx: CamFx, amount: number) { fx.trauma = Math.min(1, Math.max(0, fx.trauma + amount)); }

function hash(i: number) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967295 * 2 - 1;
}
/** Smooth 1-D value noise in [-1, 1]: integer-lattice hash with smoothstep interpolation. */
export function noise1(x: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hash(i);
  return a + (hash(i + 1) - a) * u;
}

const s = { x: 0, v: 0 };
// Snap-to-rest thresholds: kick in rad and rad/s, FOV in deg and deg/s.
const KICK_X = 1e-6, KICK_V = 1e-5, FOV_X = 1e-5, FOV_V = 1e-4;
const rest = (x: number, v: number, tx: number, tv: number) => Math.abs(x) < tx && Math.abs(v) < tv;

export function advanceCamFx(fx: CamFx, elapsed: number, reduced: boolean, t: number) {
  const dt = clampDt(elapsed);
  if (reduced) {
    fx.kickP = fx.kickY = fx.kickPv = fx.kickYv = fx.fovShot = fx.fovShotV = fx.fovKill = fx.fovKillV = fx.trauma = fx.shakeP = fx.shakeY = 0;
    return;
  }
  springStep(fx.kickP, fx.kickPv, CAM.kickW, CAM.kickZ, dt, s); fx.kickP = s.x; fx.kickPv = s.v;
  if (rest(fx.kickP, fx.kickPv, KICK_X, KICK_V)) fx.kickP = fx.kickPv = 0;
  springStep(fx.kickY, fx.kickYv, CAM.kickW, CAM.kickZ, dt, s); fx.kickY = s.x; fx.kickYv = s.v;
  if (rest(fx.kickY, fx.kickYv, KICK_X, KICK_V)) fx.kickY = fx.kickYv = 0;
  springStep(fx.fovShot, fx.fovShotV, CAM.shotW, CAM.shotZ, dt, s); fx.fovShot = s.x; fx.fovShotV = s.v;
  if (rest(fx.fovShot, fx.fovShotV, FOV_X, FOV_V)) fx.fovShot = fx.fovShotV = 0;
  springStep(fx.fovKill, fx.fovKillV, CAM.killW, CAM.killZ, dt, s); fx.fovKill = s.x; fx.fovKillV = s.v;
  if (rest(fx.fovKill, fx.fovKillV, FOV_X, FOV_V)) fx.fovKill = fx.fovKillV = 0;
  fx.trauma = Math.max(0, fx.trauma - CAM.traumaDecay * dt);
  if (fx.trauma === 0) { fx.shakeP = fx.shakeY = 0; return; }
  const amp = fx.trauma * fx.trauma * CAM.shakeDeg * DEG, x = t * CAM.shakeHz;
  fx.shakeP = amp * noise1(x); fx.shakeY = amp * noise1(x + 17.3);
}

/** ADS blend: exponential at rate 20 in and 14 out, snapping to exactly 0 or 1 (float decay would otherwise park at denormals). */
export function adsStep(blend: number, on: boolean, elapsed: number, reduced: boolean) {
  if (reduced) return on ? 1 : 0;
  const target = on ? 1 : 0, b = blend + (target - blend) * (1 - Math.exp(-(on ? CAM.adsIn : CAM.adsOut) * clampDt(elapsed)));
  return on ? (1 - b < SNAP ? 1 : b) : (b < SNAP ? 0 : b);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Short-viewport weight: 1 at CSS height <= 440 (every phone in landscape), 0 at >= 600 (tablets, desktops), smoothstep between,
 * gated to landscape by smoothstep(1.2, 1.5, aspect): a small portrait phone (375x548 in Safari's 100svh) is short but stays exactly 0.
 * CSS px roughly track visual angle, so a short landscape viewport is a physically small screen that needs a bigger character. */
export function shortWeight(cssHeight: number, aspect: number) {
  if (!(cssHeight < CAM.shortTo) || !(aspect > CAM.wideFrom)) return 0;
  const t = Math.max(0, (cssHeight - CAM.shortFrom) / (CAM.shortTo - CAM.shortFrom)), a = Math.min(1, (aspect - CAM.wideFrom) / (CAM.wideTo - CAM.wideFrom));
  return (1 - smooth(t)) * smooth(a);
}
/** Hip vertical FOV: 65, or on short viewports toward a 95 deg horizontal cap (Hor+ capped). Exactly 65 at w 0. */
export function hipFovFor(aspect: number, w: number) {
  if (!(w > 0) || !(aspect > 0)) return CAM.hipFov;
  const capped = 2 * Math.atan(Math.tan(CAM.hCap * DEG / 2) / aspect) / DEG;
  return capped >= CAM.hipFov ? CAM.hipFov : CAM.hipFov - (CAM.hipFov - capped) * w;
}
/** ADS FOV at a constant zoom: tan(ads/2) = ADS_GAIN * tan(hip/2); exactly 50 at 65. */
export const adsFovOf = (hip: number) => hip === CAM.hipFov ? CAM.hipFov - CAM.adsFovDrop : 2 * Math.atan(ADS_GAIN * Math.tan(hip * DEG / 2)) / DEG;
/** Speed-widened hip FOV: exactly CameraRig's existing expression at hip 65. */
export const speedFovTarget = (speed: number, reduced: boolean, hip: number = CAM.hipFov) => reduced ? hip : hip + Math.min(speed / 17, 2);
/** CameraRig's damped base FOV (MathUtils.damp at CAM.fovRate, inlined to stay three-free). A hip change (rotation, resize) shifts
 * the base by the same amount instead of gliding; pass lastHip NaN on the first frame. */
export function baseFovStep(base: number, lastHip: number, hip: number, speed: number, reduced: boolean, elapsed: number) {
  const b = Number.isFinite(lastHip) && hip !== lastHip ? base + (hip - lastHip) : base, t = 1 - Math.exp(-CAM.fovRate * elapsed);
  return (1 - t) * b + t * speedFovTarget(speed, reduced, hip);
}
/** Rendered FOV from a separately damped base. Never feed the result back into the damp (the offsets would compound). */
export const fovFor = (baseFov: number, blend: number, reduced: boolean, punch: number, hip: number = CAM.hipFov) =>
  reduced ? baseFov : baseFov - (hip - adsFovOf(hip)) * blend + punch;

/** Chase boom (view frame) blended toward the ADS over-shoulder boom. Exactly CHASE_BOOM at blend 0 and w 0. A short viewport (w)
 * brings both booms 12% closer and lowers them (hip .2, ADS .1) so the feet stay clear of the bottom edge. */
export function boomFor(blend: number, aspect: number, out: Vec3, w = 0) {
  const k = w > 0 ? 1 - CAM.near * Math.min(w, 1) : 1, hw = w > 0 ? Math.min(w, 1) : 0;
  const hx = CHASE_BOOM.x * k, hy = hw ? CHASE_BOOM.y - CAM.hipDrop * hw : CHASE_BOOM.y, hz = CHASE_BOOM.z * k;
  if (blend <= 0) { out.x = hx; out.y = hy; out.z = hz; return out; }
  const t = Math.min(1, Math.max(0, (aspect - .46) / .54)), z = (3.4 + (2.6 - 3.4) * t) * k, y = .55 + (.45 - .55) * t - CAM.adsDrop * hw;
  const tanA = hw ? Math.tan(adsFovOf(hipFovFor(aspect, hw)) * DEG / 2) : TAN25;
  const x = Math.min(.85, .6 * z * tanA * aspect), a = Math.min(blend, 1);
  out.x = hx + (x - hx) * a; out.y = hy + (y - hy) * a; out.z = hz + (z - hz) * a;
  return out;
}
/** Screen radius (px) of a cone with the given half-angle (rad) at vertical FOV fovDeg on a viewport heightPx tall. */
export const reticleRadiusPx = (halfAngle: number, fovDeg: number, heightPx: number) =>
  Math.tan(halfAngle) / Math.tan(fovDeg * DEG / 2) * heightPx / 2;
