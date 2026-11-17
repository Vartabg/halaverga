// Counters (Garo 2026-10-20). A demon that is about to hit the angel opens a counter window: while its charge
// passes COUNTER.chargeOpen of the windup, or while one of its fiery darts is closing on the angel and will pass within
// COUNTER.dartMiss of it inside COUNTER.dartLead seconds. A strike press in that window (tap, click, C, 2, a flick, Chain)
// becomes a counter: the dart is quenched, the charge is broken, the rebuke rings out (Jude 9) and the angel dives at the attacker
// in slow motion; banish.ts then lands the blow as the sword string's opening cut. Bind (3) and cast (4) keep their own meaning.
// A counter is credited only when the dive can run: the attacker is alive, standing, in line of sight with a clear flight path
// and within the sword's reach (the same gates banish.ts applies). A dart whose thrower is out of reach is deflected instead:
// quenched on the shield of faith (Ephesians 6:16), no dive and no counter credited. The credit itself waits for the dive: a press
// during another strike is queued by chain combat, and only a dive that really launches at the attacker counts (settleCounter).
// The press keeps its own target instead (keepsTarget) when that target is one blow from being cast down (a demon two cuts in, a
// warden with its armour broken) or is a warden left open by a dodge or a parry: a redirect never takes away a finishing blow or
// an earned opening. Such a press still quenches a dart in flight.
// Game fiction drawn from the texts in docs/research/combat-texts.md. Pure, allocation-free per frame.
import { droneAlive, type ShooterState, type Vec3 } from './combat';
import { BATTLE, battle } from './celestialBattle';
import { COMMAND } from './commands';
import { BANISH, FX, MODE, banish } from './banishState';
import { flowPaths } from './combatFlow';
import { counterState } from './counterState';
import { isElite } from './encounter';
import { startSlowMotion } from './slowMotion';
import { addTrauma } from './cameraFx';
import { strike } from './strike';
import { LAST, pressTarget } from './swordString';
import { wardenExposed } from './wardenCounter';

export const COUNTER = { chargeOpen: .3, dartLead: .6, dartMiss: 2.5 } as const;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Whether the chain strike would dive at demon i now (banish.ts apply: alive, standing, seen, clear path, within reach). */
export function canDive(s: ShooterState, player: Vec3, i: number) {
  return i >= 0 && droneAlive(s.drones, i) && banish.mode[i] < MODE.down && !!s.targets[i]?.los && !!flowPaths[i]
    && dist(s.drones.pos[i], player) <= BANISH.swordReach;
}
/** Whether a press keeps its own target rather than diving at the attacker: the demon it would strike (the tapped one, else the
 * usual choice, the string in progress first) is one blow from being cast down, or is a warden left open. Never when that demon
 * is the attacker itself: that press is the counter. A warden that is neither is an ordinary target: the counter comes first. */
export function keepsTarget(s: ShooterState, player: Vec3, attacker: number, chosen = -1) {
  const i = chosen >= 0 ? chosen : pressTarget(banish, s, player);
  if (i < 0 || i === attacker || !droneAlive(s.drones, i)) return false;
  return isElite(i) ? banish.armor[i] === 0 || wardenExposed(banish.wardens, i) : banish.wounds[i] >= LAST;
}
/** Seconds until the dart passes closest to the angel, or -1 when it is receding or will pass wider than COUNTER.dartMiss. */
export function dartIntercept(p: Vec3, v: Vec3, player: Vec3) {
  const rx = player.x - p.x, ry = player.y - p.y, rz = player.z - p.z, vv = v.x * v.x + v.y * v.y + v.z * v.z;
  if (vv <= 0) return -1;
  const t = (rx * v.x + ry * v.y + rz * v.z) / vv;
  if (t <= 0) return -1;
  const mx = rx - v.x * t, my = ry - v.y * t, mz = rz - v.z * t;
  return mx * mx + my * my + mz * mz <= COUNTER.dartMiss * COUNTER.dartMiss ? t : -1;
}
/** Recomputes the window each frame from the live battle: the soonest incoming dart wins over a charge. active: the angel is
 * flying. On the ground the battle stands still and no dive could run, so no window opens there. */
export function updateCounterWindow(s: ShooterState, player: Vec3, realDt: number, active = true) {
  counterState.since += Math.max(0, realDt);
  let attacker = -1, bolt = -1;
  if (active && battle.status === 'battle') {
    if (battle.charging >= 0 && battle.charge >= BATTLE.windup * COUNTER.chargeOpen) attacker = battle.charging;
    let soonest: number = COUNTER.dartLead;
    for (let k = 0; k < battle.bolts.length; k++) {
      const o = battle.bolts[k];
      if (!o.live) continue;
      const eta = dartIntercept(o.p, o.v, player);
      if (eta >= 0 && eta < soonest) { soonest = eta; bolt = k; attacker = o.src; }
    }
  }
  if (!canDive(s, player, attacker)) attacker = -1;
  counterState.source = attacker;
  // The ring and the prompt promise a dive only when an untargeted press would make one, and not again while one is on its way.
  if (attacker >= 0 && (attacker === counterState.pending || keepsTarget(s, player, attacker))) attacker = -1;
  counterState.attacker = attacker; counterState.bolt = bolt; counterState.open = attacker >= 0 || bolt >= 0;
}
function emitRebuke(from: Vec3, to: Vec3, drone: number) {
  const e = banish.fx[banish.fxSerial % banish.fx.length];
  e.serial = ++banish.fxSerial; e.kind = FX.rebuke; e.t = banish.clock; e.drone = drone;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.to.x = to.x; e.to.y = to.y; e.to.z = to.z;
}
/** Strike presses counter; a flick aimed at a bound demon is a cast (banish.ts apply) and keeps that meaning, as bind and cast do. */
const strikeInput = (s: ShooterState) => {
  const { cmdKind: kind, cmdTarget: target } = s.input;
  if (kind === COMMAND.flick) return !(target >= 0 && banish.mode[target] === MODE.bound);
  return kind === COMMAND.context || kind === COMMAND.sword;
};
/**
 * Call before the command is handled (stepBanish). When a new strike command arrives with the window open, the incoming dart is
 * quenched and, if the dive can run, the command is retargeted to the attacker as a sword stroke and the counter waits for that
 * dive (returns 'pending'; settleCounter credits it). With no dive possible the dart is deflected (returns 'deflect') and the
 * command is left as pressed. Otherwise returns '' and changes nothing.
 */
export function tryCounter(s: ShooterState, player: Vec3): '' | 'pending' | 'deflect' {
  const input = s.input;
  const { bolt, source } = counterState;
  if (source < 0 && bolt < 0 || input.cmd === banish.handled || !strikeInput(s)) return '';
  const attacker = canDive(s, player, source) && !keepsTarget(s, player, source, input.cmdTarget) ? source : -1;
  if (attacker < 0 && bolt < 0) return '';
  if (bolt >= 0) { battle.bolts[bolt].live = false; battle.quenched++; }
  counterState.open = false;
  if (attacker < 0) { counterState.deflects++; addTrauma(s.camFx, .15); return 'deflect'; }
  input.cmdKind = COMMAND.sword; input.cmdTarget = attacker;
  counterState.pending = attacker; counterState.pendingQuenched = bolt >= 0; counterState.pendingSerial = strike.serial;
  return 'pending';
}
/**
 * Call after stepBanish. A pending counter is credited once, when a strike begun since the press (a dive, or a step-in on a
 * wounded attacker) is under way at its attacker or has already struck it in the same step: the charge is broken, the
 * rebuke rings out and slow motion starts. While chain combat still holds it in its queue it waits; if the queue drops it (the
 * strike before it was cancelled, or its time ran out) nothing is credited and a quenched dart stands as a deflection.
 */
export function settleCounter(s: ShooterState, player: Vec3): '' | 'counter' | 'dropped' {
  const i = counterState.pending;
  if (i < 0) return '';
  if (strike.queued && strike.queueTarget === i) return '';
  // Under way, or a close attacker reached and struck within this same step (launch and landing in one stepBanish).
  // strike.serial: only a strike begun after the press counts, never a hold left over from an earlier cut on the same demon.
  if (strike.serial !== counterState.pendingSerial && strike.target === i && (strike.phase === 1 || strike.phase === 2 && strike.landed)) {
    counterState.pending = -1;
    if (battle.charging === i) battle.charging = -1;
    // A dart it threw while the press waited in the queue is quenched too: the dive must not fly into the attack it answers.
    for (const o of battle.bolts) if (o.live && o.src === i) { o.live = false; battle.quenched++; }
    battle.nextAttack = battle.clock + 2.2; // the host hesitates after a counter
    emitRebuke(player, s.drones.pos[i], i);
    banish.rebukeT = banish.clock;
    startSlowMotion(); counterState.serial++; counterState.since = 0;
    addTrauma(s.camFx, .15); // a small jolt; no zoom (the slow motion carries the moment)
    return 'counter';
  }
  counterState.pending = -1;
  if (counterState.pendingQuenched) counterState.deflects++;
  return 'dropped';
}
/** Clears any pending counter (the encounter mounting or leaving). */
export function resetCounter() { counterState.pending = -1; counterState.open = false; counterState.attacker = counterState.source = counterState.bolt = -1; }
