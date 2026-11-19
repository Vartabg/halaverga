import { BLADE, BODY } from '@/game/bladeReach';
import { momentumVelocity, FLIGHT } from '@/game/momentumFlight';
import { setVec, type Vec } from '@/game/motion';
import { ARRIVAL, clearApproach, clearRock, watcherAt } from './course';
import { shoulderLift } from './shoulderWind';

export type Phase = 'ready' | 'flight' | 'strike' | 'safe' | 'late';
export type CrossingInput = { horizontal: number; vertical: number; strike: boolean };
export type Crossing = {
  phase: Phase; player: Vec; velocity: Vec; watcher: Vec;
  elapsed: number; after: number; inReach: boolean; strikeTime: number; remainder: number;
};

const STEP = 1 / 120;
const REACH = 10;
// Finish inside the measured sword/body reach, leaving the actors an arm's length apart for the cut.
const CONTACT = BLADE.reach + BODY.lesser.radius - .5;
const limit = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;

function reset(s: Crossing, phase: Phase) {
  s.phase = phase;
  setVec(s.player, 0, 34, 165);
  setVec(s.velocity, 0, 0, -FLIGHT.cruise);
  watcherAt(0, s.watcher);
  s.elapsed = 0; s.after = 0; s.strikeTime = 0; s.remainder = 0; s.inReach = false;
}

export function createCrossing(): Crossing {
  const s: Crossing = {
    phase: 'ready', player: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, watcher: { x: 0, y: 0, z: 0 },
    elapsed: 0, after: 0, strikeTime: 0, remainder: 0, inReach: false,
  };
  reset(s, 'ready');
  return s;
}

export function launchCrossing(s: Crossing) { reset(s, 'flight'); }

function withinReach(s: Crossing) {
  const p = s.player, w = s.watcher;
  const distance = Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
  return distance <= REACH && w.z <= p.z + 3 && clearApproach(p, w, distance);
}

function coast(s: Crossing) {
  const p = s.player, v = s.velocity;
  p.x += v.x * STEP; p.y += v.y * STEP; p.z += v.z * STEP;
  clearRock(p, v, s.phase === 'strike');
}

function fly(s: Crossing, horizontal: number, vertical: number) {
  const lift = shoulderLift(s.player.x, s.player.y, s.player.z);
  const air = { x: s.velocity.x, y: s.velocity.y - lift, z: s.velocity.z };
  const v = momentumVelocity(air, { forward: 1, strafe: horizontal * .88, vertical: vertical * .67 }, 0, 0, true, false, STEP);
  setVec(s.velocity, v.x, v.y + lift, v.z);
  coast(s);
  s.inReach = withinReach(s);
  if (s.elapsed >= ARRIVAL) { s.phase = 'late'; s.inReach = false; }
}

function lunge(s: Crossing) {
  s.strikeTime += STEP;
  const p = s.player, w = s.watcher;
  const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, distance = Math.hypot(dx, dy, dz);
  const advance = Math.min(46, Math.max(0, distance - CONTACT) / STEP) / Math.max(.001, distance);
  setVec(s.velocity, dx * advance, dy * advance, dz * advance);
  coast(s);
  if (Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z) <= CONTACT + .001) s.phase = 'safe';
}

function ending(s: Crossing) {
  const previous = s.after;
  s.after += STEP;
  if (s.after < .11 || previous >= 3.5) return;
  const remaining = Math.max(0, 1 - (s.after - .11) / (3.5 - .11));
  const ease = Math.min(1, (s.after - .11) * 3) * remaining;
  if (s.phase === 'safe') {
    s.watcher.x -= 26 * ease * STEP;
    s.watcher.y += 22 * ease * STEP;
    s.watcher.z -= 9 * ease * STEP;
  } else {
    s.watcher.y += 2 * ease * STEP;
  }
  const blend = 1 - Math.exp(-4 * STEP);
  s.velocity.x *= 1 - blend;
  s.velocity.y += (3 * remaining - s.velocity.y) * blend;
  s.velocity.z += (-13 * remaining - s.velocity.z) * blend;
  coast(s);
  if (s.after >= 3.5) setVec(s.velocity, 0, 0, 0);
}

/** Consume a press at the pose the pilot saw. Retry and separate mounts each have their own clock and vectors. */
export function stepCrossing(s: Crossing, input: CrossingInput, dt: number) {
  if (s.phase === 'ready' || !Number.isFinite(dt) || dt <= 0) return;
  if (s.phase === 'flight' && input.strike && s.inReach) { s.phase = 'strike'; s.inReach = false; }
  s.remainder += Math.min(.25, dt);
  const ticks = Math.floor((s.remainder + 1e-10) / STEP);
  s.remainder = Math.max(0, s.remainder - ticks * STEP);
  const horizontal = limit(input.horizontal), vertical = limit(input.vertical);
  for (let tick = 0; tick < ticks; tick++) {
    if (s.phase === 'safe' || s.phase === 'late') { ending(s); continue; }
    s.elapsed = Math.min(ARRIVAL, s.elapsed + STEP);
    watcherAt(s.elapsed, s.watcher);
    if (s.phase === 'strike') lunge(s);
    else fly(s, horizontal, vertical);
  }
}
