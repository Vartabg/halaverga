// Arkham-style counters (Garo 2026-10-20). A demon that is about to hit the angel opens a counter window: while its charge
// passes COUNTER.chargeOpen of the windup, or while one of its fiery darts is closing on the angel and will pass within
// COUNTER.dartMiss of it inside COUNTER.dartLead seconds. A strike press in that window (tap, click, C, 2, a flick, Chain)
// becomes a counter: the dart is quenched, the charge is broken, the rebuke rings out (Jude 9) and the angel dives at the attacker
// in slow motion; chain combat (banish.ts) then lands the blow. Bind (3) and cast (4) keep their own meaning.
// A counter is credited only when the dive can run: the attacker is alive, standing, in line of sight with a clear flight path
// and within the sword's reach (the same gates banish.ts applies). A dart whose thrower is out of reach is deflected instead:
// quenched on the shield of faith (Ephesians 6:16), no dive and no counter credited.
// Game fiction drawn from the texts in docs/research/combat-texts.md. Pure, allocation-free per frame.
import { droneAlive, type ShooterState, type Vec3 } from './combat';
import { BATTLE, battle } from './celestialBattle';
import { COMMAND } from './commands';
import { BANISH, FX, MODE, banish } from './banishState';
import { flowPaths } from './combatFlow';
import { counterState } from './counterState';
import { startBulletTime } from './bulletTime';
import { addTrauma, punchFov } from './cameraFx';

export const COUNTER = { chargeOpen: .3, dartLead: .6, dartMiss: 2.5 } as const;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Whether the chain strike would dive at demon i now (banish.ts apply: alive, standing, seen, clear path, within reach). */
export function canDive(s: ShooterState, player: Vec3, i: number) {
  return i >= 0 && droneAlive(s.drones, i) && banish.mode[i] < MODE.down && !!s.targets[i]?.los && !!flowPaths[i]
    && dist(s.drones.pos[i], player) <= BANISH.swordReach;
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
/** Recomputes the window each frame from the live battle: the soonest incoming dart wins over a charge. */
export function updateCounterWindow(s: ShooterState, player: Vec3, realDt: number) {
  counterState.since += Math.max(0, realDt);
  let attacker = -1, bolt = -1;
  if (battle.status === 'battle') {
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
  counterState.attacker = attacker; counterState.bolt = bolt; counterState.open = attacker >= 0 || bolt >= 0;
}
function emitRebuke(from: Vec3, to: Vec3, drone: number) {
  const e = banish.fx[banish.fxSerial % banish.fx.length];
  e.serial = ++banish.fxSerial; e.kind = FX.rebuke; e.t = banish.clock; e.drone = drone;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.to.x = to.x; e.to.y = to.y; e.to.z = to.z;
}
const strikeInput = (kind: number) => kind === COMMAND.context || kind === COMMAND.sword || kind === COMMAND.flick;
/**
 * Call before the command is handled (stepBanish). When a new strike command arrives with the window open it becomes a counter
 * (returns 'counter': retargeted to the attacker as a sword stroke, so chain combat performs the dive) or, when no dive can run,
 * a deflection of the incoming dart (returns 'deflect': the command is left as pressed). Otherwise returns '' and changes nothing.
 */
export function tryCounter(s: ShooterState, player: Vec3): '' | 'counter' | 'deflect' {
  const input = s.input;
  if (!counterState.open || input.cmd === banish.handled || !strikeInput(input.cmdKind)) return '';
  const { bolt } = counterState, attacker = canDive(s, player, counterState.attacker) ? counterState.attacker : -1;
  if (attacker < 0 && bolt < 0) return '';
  if (bolt >= 0) { battle.bolts[bolt].live = false; battle.quenched++; }
  counterState.open = false;
  if (attacker < 0) { counterState.deflects++; addTrauma(s.camFx, .15); return 'deflect'; }
  if (battle.charging === attacker) battle.charging = -1;
  battle.nextAttack = battle.clock + 2.2; // the host hesitates after a counter
  input.cmdKind = COMMAND.sword; input.cmdTarget = attacker;
  emitRebuke(player, s.drones.pos[attacker], attacker);
  banish.rebukeT = banish.clock;
  startBulletTime(); counterState.serial++; counterState.since = 0;
  addTrauma(s.camFx, .3); punchFov(s.camFx, 'kill', 7);
  return 'counter';
}
