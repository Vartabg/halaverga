import { droneAlive, type ShooterState, type Vec3 } from './combat';
import { MODE, type BanishState } from './banishState';
import { WA } from './banishState';
import { strike } from './strike';
import { beginWardenNavigation, stepWardenNavigation, stopWardenNavigation } from './wardenNavigation';
import { PURSUIT } from './wardenSteering';
import { wardenSegment } from './wardenMath';
import { COMMAND } from './commands';
export function releaseWardenPursuit(b: BanishState, s: ShooterState) {
  const w = b.wardens, i = w.duel; if (i < 0) return;
  stopWardenNavigation(w, i); w.navSet[i] = 0; w.navLost[i] = w.relocate[i] = 0;
  w.phase[i] = WA.idle; w.open[i] = w.engage[i] = 0; b.guardTime[i] = 0;
  if (w.active === i) w.active = -1;
  if (w.pending === i) w.pending = -1;
  w.bolts.forEach(o => { if (o.src === i) o.live = false; });
  if (b.mode[i] < MODE.down) s.drones.held[i] = 0;
  w.duel = -1;
}
export function updateWardenPursuit(b: BanishState, s: ShooterState, player: Vec3, dt: number) {
  const w = b.wardens, i = w.duel; if (i < 0) return;
  const p = s.drones.pos[i], d = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z);
  if (!droneAlive(s.drones, i) || s.drones.hp[i] <= 0 || b.mode[i] < MODE.bound && d > PURSUIT.disengage) { releaseWardenPursuit(b, s); return; }
  w.navLost[i] = s.targets[i].los && wardenSegment(p, player) ? 0 : w.navLost[i] + dt;
  if (b.mode[i] < MODE.bound && w.navLost[i] > PURSUIT.lost) { releaseWardenPursuit(b, s); return; }
  beginWardenNavigation(w, s, i);
  const request = s.input.cmd !== b.handled && (s.input.cmdKind === COMMAND.sword || s.input.cmdKind === COMMAND.context)
    && (s.input.cmdTarget < 0 || s.input.cmdTarget === i);
  const queued = strike.queued && (strike.queueTarget < 0 || strike.queueTarget === i);
  const moving = w.turns[i] > 0 && b.mode[i] === MODE.free && b.armor[i] > 0 && w.phase[i] === WA.idle && !request && !queued && !(strike.phase === 1 && strike.target === i);
  if (moving) { b.guardTime[i] = 0; stepWardenNavigation(w, s, i, player, dt); } else stopWardenNavigation(w, i);
}
