// Arkham-style counters (Garo 2026-10-20). A demon that is about to hit the angel opens a counter window: while its charge
// passes COUNTER.chargeOpen of the windup, or while one of its fiery darts will reach the angel within COUNTER.dartLead seconds.
// Any strike press in that window (tap, click, C, Chain) becomes a counter: the dart is quenched, the charge is broken, the
// rebuke rings out (Jude 9) and the angel dives at the attacker in slow motion. Chain combat (banish.ts) then lands the blow.
// Game fiction drawn from the texts in docs/research/combat-texts.md. Pure, allocation-free per frame.
import { droneAlive, type ShooterState, type Vec3 } from './combat';
import { BATTLE, battle } from './celestialBattle';
import { COMMAND } from './commands';
import { FX, MODE, banish } from './banishState';
import { counterState } from './counterState';
import { startBulletTime } from './bulletTime';
import { addTrauma, punchFov } from './cameraFx';

export const COUNTER = { chargeOpen: .3, dartLead: .6, reach: 75 } as const;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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
      const eta = dist(o.p, player) / BATTLE.speed;
      if (eta < soonest) { soonest = eta; bolt = k; attacker = o.src; }
    }
  }
  if (attacker >= 0 && (!droneAlive(s.drones, attacker) || banish.mode[attacker] >= MODE.down || dist(s.drones.pos[attacker], player) > COUNTER.reach)) attacker = -1;
  counterState.attacker = attacker; counterState.bolt = bolt; counterState.open = attacker >= 0 || bolt >= 0;
}
function emitRebuke(from: Vec3, to: Vec3, drone: number) {
  const e = banish.fx[banish.fxSerial % banish.fx.length];
  e.serial = ++banish.fxSerial; e.kind = FX.rebuke; e.t = banish.clock; e.drone = drone;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.to.x = to.x; e.to.y = to.y; e.to.z = to.z;
}
/**
 * Call before the command is handled (stepBanish). When a new strike command arrives with the window open, it becomes a counter:
 * returns true. The command is retargeted to the attacker as a sword stroke, so chain combat performs the dive.
 */
export function tryCounter(s: ShooterState, player: Vec3) {
  const input = s.input;
  if (!counterState.open || input.cmd === banish.handled || input.cmdKind === COMMAND.rebuke) return false;
  const { attacker, bolt } = counterState;
  if (bolt >= 0) { battle.bolts[bolt].live = false; battle.quenched++; }
  if (battle.charging >= 0) battle.charging = -1;
  battle.nextAttack = battle.clock + 2.2; // the host hesitates after a counter
  if (attacker >= 0) {
    input.cmdKind = COMMAND.sword; input.cmdTarget = attacker;
    emitRebuke(player, s.drones.pos[attacker], attacker);
  }
  banish.rebukeT = banish.clock;
  startBulletTime(); counterState.serial++; counterState.since = 0; counterState.open = false;
  addTrauma(s.camFx, .3); punchFov(s.camFx, 'kill', 7);
  return true;
}
