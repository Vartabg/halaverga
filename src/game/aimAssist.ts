// Aim assist (phase 1): target zones, the acquired cue and bullet magnetism. No look friction and no target drift since
// 2026-09-26 (Garo: shooting must never slow or steer the view). Pure and landing-safe: no three/React Three/Rapier, no rotational
// pull (runtime.yaw/pitch are the flight heading), and no allocation after module load.
import { ASSIST_PROFILE, engaged, type DroneTarget, type LookSource, type ShooterState, type Vec3 } from './combat';
import { bloom01 } from './weapon';

/** Angles in degrees. The zones only pick the target (HUD, perception); the magnet cone is the assist itself. */
export const ZONES = { hipInner: .6, hipOuter: 2, adsInner: .4, adsOuter: 1.2, magnetHip: 1.5, magnetAds: .75, magnetFull: 60, magnetZero: 100 } as const;
export type AssistMemory = { target: number; valid: boolean };
export type BestTarget = { index: number; zone: 0 | 1 | 2; angle: number; dist: number };
export const createAssistMemory = (): AssistMemory => ({ target: -1, valid: false });
/** Zone widths scale with the rendered FOV against the live hip FOV (65, or less on a short landscape screen), so ADS zones match. */
export const fovScale = (fovDeg: number, hipDeg = 65) => Math.tan(fovDeg * Math.PI / 360) / Math.tan(hipDeg * Math.PI / 360);

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Angle between d and (c - o), and the distance |c - o|, into a module scratch. atan2 keeps small angles exact. */
const probe = { angle: 0, dist: 0 };
function measure(o: Vec3, d: Vec3, c: Vec3) {
  const x = c.x - o.x, y = c.y - o.y, z = c.z - o.z;
  const cx = d.y * z - d.z * y, cy = d.z * x - d.x * z, cz = d.x * y - d.y * x;
  probe.angle = Math.atan2(Math.hypot(cx, cy, cz), d.x * x + d.y * y + d.z * z);
  probe.dist = Math.hypot(x, y, z);
  return probe;
}
const radiusAngle = (r: number, dist: number) => dist <= r ? Math.PI / 2 : Math.asin(r / dist);

/** Picks the live, visible target nearest the aim in angle (edge-first), with its zone (2 inner, 1 outer, 0 none). */
export function bestTarget(o: Vec3, d: Vec3, targets: readonly DroneTarget[], count: number, fovDeg: number, ads: number,
  out: BestTarget, hipDeg = 65): BestTarget {
  const k = fovScale(fovDeg, hipDeg) * DEG;
  const inW = lerp(ZONES.hipInner, ZONES.adsInner, ads) * k, outW = lerp(ZONES.hipOuter, ZONES.adsOuter, ads) * k;
  out.index = -1; out.zone = 0; out.angle = 0; out.dist = 0;
  let best = Infinity;
  for (let i = 0; i < count && i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive || !t.los) continue;
    const { angle, dist } = measure(o, d, t.c), rho = radiusAngle(t.r, dist);
    const zone = angle <= rho + inW ? 2 : angle <= rho + outW ? 1 : 0;
    if (zone === 0 || angle - rho >= best) continue;
    best = angle - rho; out.index = i; out.zone = zone; out.angle = angle; out.dist = dist;
  }
  return out;
}

const pick: BestTarget = { index: -1, zone: 0, angle: 0, dist: 0 };
/**
 * Per-frame assist update. Writes only s.assist (engaged, scale) and s.aim.acquired/target; the view is never touched. The amber
 * 'acquired' cue lights only when a centred shot would connect, through the same magnet cone the shot uses (device profile, ADS,
 * bloom, 60-100 m falloff) or, with assist off or out of magnet range, on the body. mem remembers the target (tests, HUD).
 */
export function advanceAssist(s: ShooterState, mem: AssistMemory, o: Vec3, d: Vec3, fovDeg: number, strength: number, _elapsed: number) {
  const as = s.assist, on = engaged(s) && strength > 0;
  as.engaged = on; as.scale = strength;
  const b = bestTarget(o, d, s.targets, s.drones.count, fovDeg, s.aim.blend, pick, s.aim.hipFov);
  s.aim.target = b.index;
  s.aim.acquired = magnetize(o, d, s.targets, s.drones.count, s.aim.blend, bloom01(s.weapon), s.input.lookSource, strength) >= 0
    || (b.index >= 0 && b.angle <= radiusAngle(s.targets[b.index].r, b.dist));
  mem.target = b.index; mem.valid = on && b.index >= 0;
}

/**
 * Bullet magnetism: index of the live, visible target whose angular radius plus the magnet cone contains the shot ray, or -1.
 * Full strength to 60 m, zero from 100 m; bloom halves it; a zero cone (strength 0, beyond 100 m) never magnetizes.
 */
export function magnetize(o: Vec3, d: Vec3, targets: readonly DroneTarget[], count: number, ads: number, bloom01: number,
  src: LookSource, strength: number): number {
  if (!(strength > 0)) return -1;
  const base = lerp(ZONES.magnetHip, ZONES.magnetAds, ads) * DEG * ASSIST_PROFILE[src].magnet * strength * (1 - .5 * bloom01);
  let best = Infinity, index = -1;
  for (let i = 0; i < count && i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive || !t.los) continue;
    const { angle, dist } = measure(o, d, t.c);
    const fall = dist <= ZONES.magnetFull ? 1 : dist >= ZONES.magnetZero ? 0 : (ZONES.magnetZero - dist) / (ZONES.magnetZero - ZONES.magnetFull);
    const m = base * fall, rho = radiusAngle(t.r, dist);
    if (!(m > 0) || angle > rho + m || angle - rho >= best) continue;
    best = angle - rho; index = i;
  }
  return index;
}
