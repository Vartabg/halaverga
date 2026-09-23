// Aim assist (phase 1): friction zones, target drift and bullet magnetism. Pure and landing-safe: no three/React Three/Rapier,
// no rotational pull (runtime.yaw/pitch are the flight heading), and no allocation after module load.
import { ASSIST_PROFILE, engaged, type DroneTarget, type LookSource, type ShooterState, type Vec3 } from './combat';
import { angleDelta } from './presentation';
import { bloom01 } from './weapon';

/** Angles in degrees. Slow values are zone base strengths before the device profile and the strength setting. */
export const ZONES = { hipInner: .6, hipOuter: 2, adsInner: .4, adsOuter: 1.2, hipSlowInner: .6, hipSlowOuter: .5, adsSlowInner: .7,
  adsSlowOuter: .4, rampIn: 60, rampOut: 4, magnetHip: 1.5, magnetAds: .75, magnetFull: 60, magnetZero: 100, driftRate: 10 } as const;
export type AssistMemory = { target: number; yaw: number; pitch: number; valid: boolean };
export type BestTarget = { index: number; zone: 0 | 1 | 2; angle: number; dist: number };
export const createAssistMemory = (): AssistMemory => ({ target: -1, yaw: 0, pitch: 0, valid: false });
/** Zone widths scale with the rendered FOV so their on-screen size matches the 65 deg hip view. */
export const fovScale = (fovDeg: number) => Math.tan(fovDeg * Math.PI / 360) / Math.tan(32.5 * Math.PI / 180);

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

/** Picks the live, visible target nearest the aim in angle (edge-first), with its friction zone (2 inner, 1 outer, 0 none). */
export function bestTarget(o: Vec3, d: Vec3, targets: readonly DroneTarget[], count: number, fovDeg: number, ads: number,
  out: BestTarget): BestTarget {
  const k = fovScale(fovDeg) * DEG;
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
 * Per-frame assist update. Writes only s.assist and s.aim.acquired/target. The slow ramps at a constant rate (Lyra: in 60/s,
 * out 4/s) to exactly 0; drift is the target's bearing rate, settled at rate 10, and resets to exactly 0 on a target change.
 * The amber 'acquired' cue is not the friction zone: it lights only when a centred shot would connect, through the same
 * magnet cone the shot uses (device profile, ADS, bloom, 60-100 m falloff) or, with assist off or out of magnet range, on the body.
 */
export function advanceAssist(s: ShooterState, mem: AssistMemory, o: Vec3, d: Vec3, fovDeg: number, strength: number, elapsed: number) {
  const dt = Number.isFinite(elapsed) ? Math.min(Math.max(elapsed, 0), .05) : 0, as = s.assist;
  const on = engaged(s) && strength > 0;
  as.engaged = on; as.scale = strength;
  const b = bestTarget(o, d, s.targets, s.drones.count, fovDeg, s.aim.blend, pick);
  s.aim.target = b.index;
  s.aim.acquired = magnetize(o, d, s.targets, s.drones.count, s.aim.blend, bloom01(s.weapon), s.input.lookSource, strength) >= 0
    || (b.index >= 0 && b.angle <= radiusAngle(s.targets[b.index].r, b.dist));
  const inner = b.zone === 2, a = s.aim.blend;
  const goal = on && b.zone > 0
    ? lerp(inner ? ZONES.hipSlowInner : ZONES.hipSlowOuter, inner ? ZONES.adsSlowInner : ZONES.adsSlowOuter, a) : 0;
  as.slow = as.slow < goal ? Math.min(goal, as.slow + ZONES.rampIn * dt) : Math.max(goal, as.slow - ZONES.rampOut * dt);
  if (!on || b.index < 0) {
    as.driftYaw = 0; as.driftPitch = 0; mem.valid = false; mem.target = b.index; return;
  }
  const c = s.targets[b.index].c, x = c.x - o.x, y = c.y - o.y, z = c.z - o.z;
  const yaw = Math.atan2(-x, -z), pitch = Math.atan2(y, Math.hypot(x, z));
  if (mem.valid && mem.target === b.index) {
    if (dt > 0) {
      const g = 1 - Math.exp(-ZONES.driftRate * dt);
      as.driftYaw += (angleDelta(mem.yaw, yaw) / dt - as.driftYaw) * g;
      as.driftPitch += (angleDelta(mem.pitch, pitch) / dt - as.driftPitch) * g;
    }
  } else { as.driftYaw = 0; as.driftPitch = 0; }
  mem.target = b.index; mem.yaw = yaw; mem.pitch = pitch; mem.valid = true;
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
