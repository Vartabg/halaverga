// Aimed shots for Tap to Blast (spec 3.4). The trigger is held under its own FireSource 'gesture', so shooterStep's stale-tap
// and overheat releases (which only release 'tap') cannot cut a burst, and a TapControls press (pressFire 'tap') takes the trigger
// over cleanly. trackAimed() runs before advanceWeapon each frame and is the ONLY place that releases 'gesture'. Pure, landing-safe:
// plain {x,y,z}, no three.js; one module-level state, like burst.ts.
import { pressFire, releaseFire, type ShooterState, type Vec3 } from '../combat';
import { gesture, type GestureFacing } from './bus';
import { BURST_SHOTS, LOCK_MAX } from './tuning';

/** Aim at the eye instead of the body centre when the drone's eye faces the camera within ~60 deg (cos .5). */
const EYE_FACING_COS = .5;

export type AimedShot = {
  active: boolean;
  /** Unit camera-ray direction the shots follow while active. */
  dir: Vec3;
  /** Target drone index, or -1 for a miss shot along dir. */
  drone: number;
  /** Shots this burst fires; Infinity while a sustained hold is down, 0 once it is released. */
  n: number;
  startShots: number;
  sustained: boolean;
  /** lockBurst chain: drones in order, its length, the current slot, seconds spent on each slot and when the slot began. */
  chain: Int8Array; chainLen: number; chainAt: number; spent: Float32Array; slotT: number;
  /** gesture.facing before the aimed burst took it (restored on end if still 2). */
  prevFacing: GestureFacing;
};
export const aimed: AimedShot = { active: false, dir: { x: 0, y: 0, z: -1 }, drone: -1, n: 0, startShots: 0, sustained: false,
  chain: new Int8Array(LOCK_MAX).fill(-1), chainLen: 0, chainAt: 0, spent: new Float32Array(LOCK_MAX), slotT: 0, prevFacing: 0 };

/** Drops the aimed state without touching the trigger (scheme switch, remount, tests). */
export function resetAimed() {
  const a = aimed;
  if (a.active && gesture.facing === 2) gesture.facing = a.prevFacing;
  a.active = false; a.drone = -1; a.n = 0; a.sustained = false; a.chainLen = 0; a.chainAt = 0; a.spent.fill(0);
}
function setDir(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z);
  if (l > 1e-9) { aimed.dir.x = x / l; aimed.dir.y = y / l; aimed.dir.z = z / l; }
}
const alive = (s: ShooterState, d: number) => d >= 0 && d < s.drones.count && d < s.targets.length && s.targets[d].alive;
/** Points aimed.dir from the camera at drone d: its eye when the eye faces the camera, else its centre. */
function aimAt(s: ShooterState, d: number) {
  const g = s.targets[d], o = s.aim.origin;
  const ex = g.eye.x - g.c.x, ey = g.eye.y - g.c.y, ez = g.eye.z - g.c.z, cx = o.x - g.c.x, cy = o.y - g.c.y, cz = o.z - g.c.z;
  const el = Math.hypot(ex, ey, ez), cl = Math.hypot(cx, cy, cz);
  const eye = el > 1e-6 && cl > 1e-6 && (ex * cx + ey * cy + ez * cz) / (el * cl) >= EYE_FACING_COS;
  const p = eye ? g.eye : g.c;
  setDir(p.x - o.x, p.y - o.y, p.z - o.z);
}
function begin(s: ShooterState, dir: Vec3, drone: number, n: number, sustained: boolean) {
  const a = aimed;
  if (!a.active) a.prevFacing = gesture.facing === 2 ? 0 : gesture.facing;
  a.active = true; a.drone = drone; a.n = n; a.sustained = sustained; a.startShots = s.weapon.shots;
  setDir(dir.x, dir.y, dir.z);
  if (drone >= 0 && alive(s, drone)) aimAt(s, drone);
  gesture.facing = 2;
  pressFire(s, 'gesture');
}
/** Ends the aimed state; releases 'gesture' only when it still owns the trigger. A lock chain's aim time becomes dwell now. */
function end(s: ShooterState) {
  const a = aimed;
  releaseFire(s, 'gesture');
  if (a.chainLen > 0) {
    a.spent[a.chainAt] += Math.max(0, s.clock - a.slotT);
    for (let k = 0; k < a.chainLen; k++) if (alive(s, a.chain[k])) s.drones.dwell[a.chain[k]] += a.spent[k];
  }
  resetAimed();
}

/** A burst of n shots along dir (a miss) or at drone. Replaces any running aimed burst or lock chain. */
export function queueAimedBurst(s: ShooterState, dir: Vec3, drone: number, n = BURST_SHOTS) {
  aimed.chainLen = 0; begin(s, dir, drone, n, false);
}
/** Sustained aimed fire while the pointer stays down (release = false), ended by the pointer up (release = true). */
export function holdAimed(s: ShooterState, dir: Vec3, drone: number, release = false) {
  const a = aimed;
  if (release) { if (a.active && a.sustained) a.n = 0; return; }
  if (a.active && a.sustained && s.input.fireSource === 'gesture') {
    a.drone = drone; setDir(dir.x, dir.y, dir.z); return;
  }
  a.chainLen = 0; begin(s, dir, drone, Infinity, true);
}
/**
 * Chains BURST_SHOTS shots per drone over up to LOCK_MAX alive drones, in the given order, without releasing between them.
 * Returns the number of drones queued (0: nothing fired). Lock time counts as droneDodge dwell only once the chain ends.
 */
export function lockBurst(s: ShooterState, drones: ArrayLike<number>, count = drones.length): number {
  const a = aimed;
  a.chainLen = 0;
  for (let k = 0; k < count && a.chainLen < LOCK_MAX; k++) if (alive(s, drones[k])) a.chain[a.chainLen++] = drones[k];
  if (a.chainLen === 0) return 0;
  a.chainAt = 0; a.spent.fill(0); a.slotT = s.clock;
  begin(s, s.aim.dir, a.chain[0], BURST_SHOTS, false);
  return a.chainLen;
}
/** Moves a lock chain to its next alive drone; false when the chain is spent. */
function nextInChain(s: ShooterState) {
  const a = aimed;
  while (a.chainAt + 1 < a.chainLen) {
    a.spent[a.chainAt] += Math.max(0, s.clock - a.slotT); a.slotT = s.clock; a.chainAt++;
    const d = a.chain[a.chainAt];
    if (alive(s, d)) { a.drone = d; a.startShots = s.weapon.shots; return true; }
  }
  return false;
}

/**
 * Called once per frame before advanceWeapon. Re-aims at the target and releases 'gesture' when the burst has fired its n shots,
 * a sustained hold was released, the target died (a chain moves on), the weapon is locked or just overheated, or another source
 * took the trigger (then it only drops its own state). Returns whether an aimed burst is still running.
 */
export function trackAimed(s: ShooterState): boolean {
  const a = aimed, w = s.weapon;
  if (!a.active) return false;
  if (s.input.fireSource !== 'gesture') { end(s); return false; }
  if (w.lock > 0 || w.justOverheated) { end(s); return false; }
  const dead = a.drone >= 0 && !alive(s, a.drone), done = w.shots - a.startShots >= a.n;
  if ((dead || done) && !(a.chainLen > 0 && nextInChain(s))) { end(s); return false; }
  if (a.drone >= 0) aimAt(s, a.drone);
  return true;
}
/** The direction shots, the arm and perception follow: the aimed ray while an aimed burst runs, else the view centre. */
export const shotDirOf = (s: ShooterState): Vec3 => aimed.active ? aimed.dir : s.aim.dir;
