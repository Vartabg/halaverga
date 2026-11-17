import { droneAlive, PHASE, type ShooterState, type Vec3 } from './combat';
import { battle } from './celestialBattle';
import { MODE, type BanishState } from './banishState';
import { ELITES } from './encounter';
import { strike } from './strike';
import { WA, WARDEN } from './banishState';
import { aimWardenRush, stepWardenRush } from './wardenRush';
import { stepWardenBolts, stepWardenVolley } from './wardenVolley';
import { wardenPath } from './wardenMath';
import { flowVisible } from './combatFlow';
import { chooseWardenMove } from './wardenTactics';
import { stepWardenSweep } from './wardenSweep';
import { aimWardenFan, stepWardenFan } from './wardenFan';
import { releaseWardenPursuit, updateWardenPursuit } from './wardenPursuit';
import { stopWardenNavigation } from './wardenNavigation';
import { PURSUIT } from './wardenSteering';

export function interruptWarden(b: BanishState, s: ShooterState, i: number) {
  const w = b.wardens;
  if (w.phase[i] === WA.recover) { w.relocate[i] = PURSUIT.beat; w.navTime[i] = 0; }
  w.phase[i] = WA.idle; w.open[i] = w.engage[i] = 0; w.cool[i] = WARDEN.cooldown; stopWardenNavigation(w, i);
  w.bolts.forEach(o => { if (o.src === i) o.live = false; });
  if (w.active === i) w.active = -1;
  if (w.pending === i) w.pending = -1;
  b.guardTime[i] = 0;
  if (b.mode[i] < MODE.down) s.drones.held[i] = Number(w.duel === i);
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Single elite turn at a time. Lesser fights remain freeflow; battle and player clocks stay authoritative. */
export function stepWardenAttacks(b: BanishState, s: ShooterState, player: Vec3, dt: number) {
  const w = b.wardens, f = s.drones;
  if (dt <= 0) return;
  if (!w.ready) { Object.assign(w.previous, player); w.ready = true; }
  const playerSpeed = distance(w.previous, player) / dt;
  w.shieldAge = s.input.shield && !w.shield ? 0 : w.shieldAge + dt; w.shield = !!s.input.shield;
  if (w.pending >= 0 && (strike.phase !== 1 || strike.target !== w.pending)) w.pending = -1;
  for (const i of ELITES) {
    w.opened[i] = w.open[i]; w.cool[i] = Math.max(0, w.cool[i] - dt); b.guardTime[i] = Math.max(0, b.guardTime[i] - dt);
    if (b.mode[i] === MODE.free && !w.phase[i]) f.held[i] = Number(w.duel === i);
    if (distance(f.pos[i], player) > WARDEN.range) b.retaliate[i] = 0;
    if ((!droneAlive(f, i) || f.hp[i] <= 0 || b.mode[i] >= MODE.down || battle.status !== 'battle') && w.phase[i]) interruptWarden(b, s, i);
    if (b.mode[i] === MODE.staggered && !b.retaliate[i] && w.phase[i]) interruptWarden(b, s, i);
  }
  const active = battle.clock > w.battleClock; w.battleClock = battle.clock;
  if (battle.status !== 'battle') releaseWardenPursuit(b, s);
  if (battle.status !== 'battle' || !active || battle.clock <= 0) {
    if (w.duel >= 0) stopWardenNavigation(w, w.duel);
    w.gate.fill(battle.clock <= 0 || !active ? 11 : 12); Object.assign(w.previous, player); return;
  }
  if (w.duel >= 0) {
    battle.nextAttack = Math.max(battle.nextAttack, battle.clock + 1);
  }
  const sealing = ELITES.find(i => b.mode[i] >= MODE.bound && droneAlive(f, i));
  if (sealing !== undefined) {
    for (const i of ELITES) if (i !== sealing && w.phase[i]) interruptWarden(b, s, i);
    if (w.duel !== sealing) releaseWardenPursuit(b, s);
    stopWardenNavigation(w, sealing);
    w.duel = sealing; battle.nextAttack = Math.max(battle.nextAttack, battle.clock + 1);
    Object.assign(w.previous, player); return;
  }
  updateWardenPursuit(b, s, player, dt);
  stepWardenBolts(w, s, player, dt);
  for (const i of ELITES) {
    if (!droneAlive(f, i) || f.hp[i] <= 0 || b.mode[i] >= MODE.down || f.phase[i] === PHASE.arriving) continue;
    const phase = w.phase[i];
    if (phase === WA.idle) {
      if (b.mode[i] === MODE.staggered) continue;
      const p = f.pos[i], d = distance(p, player), aim = s.aim;
      if (d > WARDEN.range) b.retaliate[i] = 0;
      const dot = ((p.x - player.x) * aim.dir.x + (p.y - player.y) * aim.dir.y + (p.z - player.z) * aim.dir.z) / (d || 1);
      w.gate[i] = w.active >= 0 || w.duel >= 0 && w.duel !== i ? 1 : battle.charging >= 0 ? 2 : w.cool[i] > 0 ? 3 : w.relocate[i] > 0 ? 17 : b.armor[i] === 0 ? 4 : !s.targets[i].los ? 5
        : d > WARDEN.range ? 6 : !flowVisible[i] ? 7 : dot < .4 ? 8 : strike.phase === 1 && strike.target === i ? 9 : !wardenPath(p, player) ? 10 : 0;
      if (w.gate[i]) { w.engage[i] = 0; continue; }
      // A fly-through is not an invitation to an off-course rush. Hit first, or deliberately face it at low speed.
      const invited = w.duel === i && w.turns[i] > 0;
      if (!invited && !b.retaliate[i] && dot < .94) { w.engage[i] = 0; w.gate[i] = 16; continue; }
      if (!invited && !b.retaliate[i] && playerSpeed > 10) { w.engage[i] = 0; w.gate[i] = 13; continue; }
      w.engage[i] += dt;
      if (!invited && !b.retaliate[i] && w.engage[i] < .65) { w.gate[i] = 14; continue; }
      w.duel = i; battle.nextAttack = Math.max(battle.nextAttack, battle.clock + 1);
      if (battle.bolts.some(o => o.live)) { w.gate[i] = 15; continue; }
      w.active = w.duel = i; w.phase[i] = WA.tell; w.time[i] = 0; w.hit[i] = w.shots[i] = 0; w.open[i] = 0;
      chooseWardenMove(w, i, d, b.armor[i]);
      stopWardenNavigation(w, i);
      b.retaliate[i] = 0; f.held[i] = 1;
      if (i === 5) aimWardenRush(w, s, i, player); else Object.assign(w.aim[i], player);
    } else {
      w.time[i] += dt;
      if (phase === WA.tell) {
        if (w.time[i] < WARDEN.lock) {
          if (i === 5) aimWardenRush(w, s, i, player);
          else if (w.move[i] === WA.fan) aimWardenFan(w, s, i, player, dt);
          else Object.assign(w.aim[i], player);
        }
        if (w.time[i] >= w.tell[i]) {
          w.phase[i] = w.move[i]; w.time[i] = 0;
        }
      } else if (phase === WA.rush) stepWardenRush(w, s, i, player, dt);
      else if (phase === WA.volley) stepWardenVolley(w, s, i);
      else if (phase === WA.sweep) stepWardenSweep(w, s, i, player);
      else if (phase === WA.fan) stepWardenFan(w, s, i);
      else if (phase === WA.recover) {
        w.open[i] = Math.max(0, w.open[i] - dt);
        if (w.time[i] >= WARDEN.recover && w.pending !== i) interruptWarden(b, s, i);
      }
    }
    const active = w.phase[i];
    if (active) {
      f.held[i] = 1;
      const p = f.pos[i], target = active === WA.recover ? player : w.aim[i];
      f.yaw[i] = Math.atan2(p.x - target.x, p.z - target.z);
      b.guardTime[i] = active === WA.recover ? 0 : .15;
      // Keep normal darts from beginning another attack during an elite's visible turn.
      battle.nextAttack = Math.max(battle.nextAttack, battle.clock + .8);
    }
  }
  Object.assign(w.previous, player);
}
