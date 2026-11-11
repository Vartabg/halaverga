// The sword strike (Garo 2026-10-19: the strike may move the angel). A sword command launches the angel at the demon; the blow
// lands on contact with a short freeze, and the strike ends where it hit: the dash is not the angel's own speed, so flight gets
// back no more than the angel arrived with (Garo 2026-11-11: "fight throws me off").
// banish.ts starts and lands strikes; Player.tsx asks strikeStep for the step's velocity. Pure: plain {x,y,z}, no allocation.
import type { Vec3 } from './combat';
import { strikeArc } from './strikeArc';

/** The dive covers any reach in about DIVE seconds (a long one is a zip across the arena), between minSpeed and maxSpeed m/s. */
export const STRIKE = { minSpeed: 55, maxSpeed: 130, dive: .42, maxTime: 1, contact: 3.4, carry: .28, exitSpeed: 34, freeze: .045, stepIn: 7, keep: 22 } as const;
export const STRIKE_HOLD = { decay: 5.5, lock: .28 } as const;
/** phase 0 idle, 1 diving at the target, 2 on the demon after the blow. lunge / minTime: a string cut steps in over a set time
 * instead of diving. hold / recoil: between cuts the angel stays on the demon, drifting where the cut left it. last: this hold is
 * the string's last cut. serial: counts strikes begun. STRIKE.keep: the least a dash hands back (the ordinary cruise). */
export const strike = { lunge: false, minTime: 0, hold: 0, last: false, serial: 0, recoil: { x: 0, y: 0, z: 0 }, queued: false, queueTarget: -1, queueTime: 0, phase: 0, t: 0, primed: false, entry: { x: 0, y: 0, z: 0 }, entrySpeed: 0, target: -1, landed: false, halt: false, freeze: 0, carrySpeed: 34, speed: STRIKE.minSpeed as number, aim: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 } };

/** time > 0: a string cut. The step-in covers the gap in that time, so every cut has a beat before it lands. */
export function beginStrike(target: number, at: Vec3, distance = 0, time = 0) {
  strike.serial++; strike.phase = 1; strike.t = 0; strike.primed = false; strike.last = false; strike.target = target; strike.landed = false; strike.halt = false; strike.freeze = 0;
  strike.lunge = time > 0; strike.minTime = time; strike.hold = 0;
  strike.speed = time > 0 ? Math.min(STRIKE.maxSpeed, Math.max(STRIKE.stepIn, (distance - STRIKE.contact * .8) / time))
    : Math.min(STRIKE.maxSpeed, Math.max(STRIKE.minSpeed, distance / STRIKE.dive));
  strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z;
}
/** Follows a moving target while the dive is under way. */
export function aimStrike(at: Vec3) { strike.aim.x = at.x; strike.aim.y = at.y; strike.aim.z = at.z; }
/** The blow connected: freeze briefly, then a short carry (a warden's armour throws the angel back with it); a finishing blow
 * (carry false) stops at the fallen demon instead. */
export function landStrike(carry = true, contactBeat: number = STRIKE.freeze) {
  strike.phase = 2; strike.t = 0; strike.landed = true; strike.halt = !carry; strike.freeze = contactBeat; strike.last = false;
  strike.carrySpeed = STRIKE.exitSpeed;
}
/** A cut that is not the string's last: freeze, then stay on the demon for `seconds`, drifting by the recoil (which fades). */
export function holdStrike(freeze: number, seconds: number, x: number, y: number, z: number) {
  strike.phase = 2; strike.t = 0; strike.landed = true; strike.halt = false; strike.freeze = freeze; strike.hold = seconds; strike.last = false;
  strike.recoil.x = x; strike.recoil.y = y; strike.recoil.z = z;
}
/** The string's last cut: freeze, hang over the blow for a beat (so it can be seen), then be released there, at rest. */
export function finishStrike(freeze: number, seconds: number) { holdStrike(freeze, seconds, 0, 2.5, 0); strike.last = true; }
export function cancelStrike() { strike.phase = 0; strike.target = -1; strike.freeze = 0; strike.queued = false; strike.hold = 0; strike.last = false; }

/**
 * Overrides the step's velocity while a strike runs and returns true; false when idle. The flight safety still runs afterwards,
 * so a dive slides along stone instead of passing through it. Reduced motion still strikes, with no freeze.
 */
export function strikeVelocity(v: Vec3, p: Vec3, dt: number, reduced: boolean, steering = false) {
  if (strike.phase === 0) return false;
  if (strike.freeze > 0) { strike.freeze -= dt; if (!reduced) { v.x = v.y = v.z = 0; return true; } }
  strike.t += dt;
  if (strike.phase === 1) {
    const x = strike.aim.x - p.x, y = strike.aim.y - p.y, z = strike.aim.z - p.z, d = Math.hypot(x, y, z) || 1;
    strike.dir.x = x / d; strike.dir.y = y / d; strike.dir.z = z / d;
    if (strike.lunge) {
      // The step-in: straight at the demon at a set pace, easing off inside reach so the blade lands on the beat, not before it.
      const pace = d < STRIKE.contact ? 1.5 : strike.speed;
      v.x = strike.dir.x * pace; v.y = strike.dir.y * pace; v.z = strike.dir.z * pace;
      if (strike.t > STRIKE.maxTime) { strike.queued = false; strike.phase = 0; strike.target = -1; }
      return true;
    }
    // Launch from incoming travel, not from a fixed fraction of dash speed; keep direction continuous into the first .14 s.
    if (!strike.primed) {
      strike.entrySpeed = Math.hypot(v.x, v.y, v.z);
      const n = strike.entrySpeed || 1;
      strike.entry.x = v.x / n; strike.entry.y = v.y / n; strike.entry.z = v.z / n;
      strike.speed = Math.max(strike.speed, Math.min(STRIKE.maxSpeed, strike.entrySpeed)); strike.primed = true;
    }
    const u = Math.min(1, strike.t / .14), blend = u * u * (3 - 2 * u);
    const speed = strike.entrySpeed + (strike.speed - strike.entrySpeed) * blend;
    strikeArc(v, strike.entry, strike.dir, blend, speed);
    // A dive that never connects gives up and hands flight back (strikeStep takes the dash's speed with it).
    if (strike.t > STRIKE.maxTime) { strike.queued = false; strike.phase = 0; strike.target = -1; }
    return true;
  }
  if (strike.hold > 0) {
    // Between cuts: on the demon, drifting where the cut left the angel. Steering breaks away once the cut has had its moment.
    const k = Math.exp(-STRIKE_HOLD.decay * strike.t);
    v.x = strike.recoil.x * k; v.y = strike.recoil.y * k; v.z = strike.recoil.z * k;
    // The last cut hangs for its whole beat, held even against flight input, and is released at rest: flight starts from there.
    if (strike.t >= strike.hold || steering && strike.t > STRIKE_HOLD.lock && !strike.last) {
      if (strike.last) v.x = v.y = v.z = 0;
      strike.phase = 0; strike.target = -1; strike.hold = 0; strike.last = false;
    }
    return true;
  }
  // A finishing blow stops over the fallen demon, so it stays in view to bind; held flight starts again from there.
  if (strike.halt) { v.x = v.y = v.z = 0; strike.phase = 0; strike.target = -1; return true; }
  // The carry (a warden's armour throwing the angel back): never faster than its own speed, whatever the dash was doing.
  const u = Math.min(1, strike.t / STRIKE.carry), current = Math.hypot(v.x, v.y, v.z);
  const speed = Math.min(strike.carrySpeed, Math.max(current, strike.carrySpeed * Math.exp(-.55 * strike.t)));
  const t = u * u * (3 - 2 * u), n = Math.max(current, 1e-6);
  const x = strike.dir.x * (1 - t) + (current > .1 ? v.x / n : strike.dir.x) * t;
  const y = strike.dir.y * (1 - t) + (current > .1 ? v.y / n : strike.dir.y) * t;
  const z = strike.dir.z * (1 - t) + (current > .1 ? v.z / n : strike.dir.z) * t;
  const length = Math.hypot(x, y, z) || 1;
  v.x = x / length * speed; v.y = y / length * speed; v.z = z / length * speed;
  if (u >= 1) { strike.phase = 0; strike.target = -1; }
  return true;
}

/** What flight may keep when the running strike ends: the speed its dive came in with, never under STRIKE.keep, and STRIKE.keep
 * for a step-in (which has no arrival of its own). 0: nothing to take back. seen: the strike it was read from. */
const dash = { cap: 0, seen: 0 };
/**
 * One physics step of the strike, for Player: strikeVelocity, plus taking the dash back. On the first step after a strike ended,
 * or was replaced by a new one (before that one launches from it), the velocity is cut to what the angel arrived with. Every way
 * a strike ends passes here: the blow, a miss, a cancel from the fight between steps.
 */
export function strikeStep(v: Vec3, p: Vec3, dt: number, reduced: boolean, steering = false) {
  if (dash.cap > 0 && (strike.phase === 0 || dash.seen !== strike.serial)) {
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > dash.cap) { const k = dash.cap / speed; v.x *= k; v.y *= k; v.z *= k; }
    dash.cap = 0;
  }
  dash.seen = strike.serial;
  const running = strikeVelocity(v, p, dt, reduced, steering);
  if (strike.phase !== 0) dash.cap = strike.lunge || !strike.primed ? STRIKE.keep : Math.max(STRIKE.keep, strike.entrySpeed);
  return running;
}
