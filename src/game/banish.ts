// The fight (docs/research/combat-texts.md): demons are not shot. They are rebuked by a word (Mark 1:25, Jude 9), struck
// with a flaming sword (Genesis 3:24), bound with a chain once thrown down (Revelation 20:2, 1 Enoch 10:4) and cast into the abyss,
// which seals over them (Revelation 20:3). Game fiction built on those texts. Pure and allocation-free per frame; the scene chunk
// only. The ordered ritual is compressed into an automatic finisher so flight and sword attacks can chain.
import { PHASE, droneAlive, type ShooterState, type Vec3 } from './combat';
import { COMMAND } from './commands';
import { battle, BATTLE } from './celestialBattle';
import { addTrauma, punchFov } from './cameraFx';
import { restingHeight } from './wardenElevation';
import { STRIKE, aimStrike, beginStrike, cancelStrike, strike as dive } from './strike';

export { BANISH, MODE, FX, REBUKE_LINE, createBanish, banish, type BanishFx, type BanishState, type Cue } from './banishState';
import { BANISH, MODE, FX, type BanishState } from './banishState';
import { cue, dist, emit, interrupt, jolt, throwDown } from './banishHits';
import { landBlow } from './swordBlow';
import { CUTS, closeString, cutFor, reel, stringOpen, stringTarget } from './swordString';
import { flowPaths, flowTarget } from './combatFlow';
import { armorFor, castDuration, isElite } from './encounter';
import { stepEliteGuards } from './eliteCombat';
import { resetWardens } from './wardenState';
import { interruptWarden } from './wardenAttacks';
import { reserveWardenCounter } from './wardenCounter';
/** Clears every demon's state (regroup, unmount). Pending commands are dropped, not replayed. */
export function resetBanish(b: BanishState, s: ShooterState) {
  b.mode.fill(0); b.resist.fill(BANISH.resistance); b.timer.fill(0); b.cool = 0; b.handled = s.input.cmd; b.cue = ''; b.last = -1; b.resetRequested = false;
  b.combo = 0; b.comboUntil = 0; b.guardTime.fill(0); b.retaliate.fill(0); b.armor.forEach((_, i) => { b.armor[i] = armorFor(i); }); cancelStrike();
  b.quenched = battle.quenched; s.drones.held.fill(0); b.wounds.fill(0); b.string.target = -1; b.pop.forEach(p => { p.x = p.y = p.z = 0; });
  resetWardens(b.wardens);
}
/** The visible, reachable demon most aligned with the view; excludes targets already being banished. */
export function reticleTarget(b: BanishState, s: ShooterState) {
  return flowTarget(b, s, s.aim.origin);
}
/** The live, visible demon nearest the crosshair ray (within its silhouette plus a little slack), or -1. */
export function crosshairTarget(s: ShooterState) {
  const a = s.aim; let best = -1, bestAngle = Infinity;
  if (!a.valid) return -1;
  for (let i = 0; i < s.drones.count; i++) {
    const t = s.targets[i];
    if (!t.alive || !t.los) continue;
    const x = t.c.x - a.origin.x, y = t.c.y - a.origin.y, z = t.c.z - a.origin.z, d = Math.hypot(x, y, z);
    if (d < 1e-3) continue;
    const angle = Math.acos(Math.min(1, Math.max(-1, (x * a.dir.x + y * a.dir.y + z * a.dir.z) / d)));
    if (angle <= Math.atan(t.r * 1.6 / d) + BANISH.aimSlack && angle < bestAngle) { best = i; bestAngle = angle; }
  }
  return best;
}
/** Click / tap always requests a sword launch; binding and casting follow a landed hit automatically. */
export function contextKind(b: BanishState, i: number, d: number) {
  void b; void i; void d;
  return COMMAND.sword;
}
function apply(b: BanishState, s: ShooterState, player: Vec3, kind: number, target: number) {
  // A press with no chosen demon continues the string in progress before it looks for a new demon (swordString.ts).
  const kept = target < 0 && kind !== COMMAND.rebuke ? stringTarget(b, s, player) : -1;
  const i = target >= 0 ? target : kept >= 0 ? kept : flowTarget(b, s, player, kind === COMMAND.rebuke);
  if (i < 0 || !s.targets[i]?.los || !flowPaths[i] || !droneAlive(s.drones, i)) { cue(b, 'noTarget'); return; }
  const f = s.drones, p = f.pos[i], d = dist(p, player), m = b.mode[i];
  if (kind === COMMAND.context) kind = contextKind(b, i, d);
  b.last = i;
  // A flick down casts a bound demon; on any other it is a sword stroke.
  if (kind === COMMAND.flick) kind = m === MODE.bound ? COMMAND.cast : COMMAND.sword;
  if (kind === COMMAND.rebuke) {
    if (b.cool > 0) return; // only a rebuke waits on the rebuke before it; any other step may follow at once
    if (d > BANISH.rebukeRange || !s.targets[i].los) { cue(b, 'far'); return; }
    if (m <= MODE.staggered) { b.mode[i] = MODE.staggered; b.timer[i] = BANISH.stagger; b.resist[i] -= BANISH.rebukeHurt; }
    jolt(s, i, player, 9); interrupt(s, i); b.guardTime[i] = 0; b.retaliate[i] = 0; f.held[i] = 0; b.cool = BANISH.rebukeCool; b.rebukeT = b.clock;
    if (isElite(i)) interruptWarden(b, s, i);
    emit(b, FX.rebuke, i, player, p);
  } else if (kind === COMMAND.sword) {
    if (b.guardTime[i] > 0) { cue(b, 'guarded'); return; }
    if (m >= MODE.down) { cue(b, m === MODE.down ? 'notBound' : ''); return; }
    if (d > BANISH.swordReach) { cue(b, 'far'); return; }
    if (dive.phase === 1 || dive.freeze > 0 || dive.phase === 2 && dive.t < .09) {
      dive.queued = true; dive.queueTarget = target; dive.queueTime = .75; return;
    }
    // The angel dives at the demon (strike.ts), or steps in for the next cut of an open string; the blow lands in stepBanish.
    const next = stringOpen(b, i);
    beginStrike(i, p, d, next ? CUTS[cutFor(b, i)].windup : 0); s.weapon.sinceShot = 0;
    if (!next) punchFov(s.camFx, 'kill', 9); // the launch widens the view: speed you can feel
    reserveWardenCounter(b.wardens, i);
    return;
  } else if (kind === COMMAND.bind) {
    if (m !== MODE.down) { cue(b, m === MODE.bound ? 'notBound' : 'notDown'); return; }
    if (d > BANISH.bindRange) { cue(b, 'far'); return; }
    b.mode[i] = MODE.bound; b.timer[i] = 0;
    emit(b, FX.bind, i, player, p);
    return;
  } else if (kind === COMMAND.cast) {
    if (m !== MODE.bound) { cue(b, m === MODE.down ? 'notBound' : 'notDown'); return; }
    if (d > BANISH.castRange) { cue(b, 'far'); return; }
    b.mode[i] = MODE.cast; b.timer[i] = 0; b.base[i].x = p.x; b.base[i].y = p.y; b.base[i].z = p.z;
    emit(b, FX.cast, i, player, p);
    return;
  }
  if (b.resist[i] <= 0 && b.mode[i] <= MODE.staggered) throwDown(b, s, i);
}
const ease = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);

/** One frame: consumes a new command, then advances each demon's stagger, fall, chain and casting. */
export function stepBanish(b: BanishState, s: ShooterState, player: Vec3, dt: number) {
  dt = Math.min(.05, Math.max(0, dt)); b.clock += dt; b.cool = Math.max(0, b.cool - dt);
  const input = s.input, f = s.drones;
  if (b.resetRequested) resetBanish(b, s);
  stepEliteGuards(b, s, player, dt);
  if (b.clock > b.comboUntil) b.combo = 0;
  if (dive.queued) {
    dive.queueTime -= dt;
    if (dive.queueTime <= 0) dive.queued = false;
    else if (dive.phase !== 1 && dive.freeze <= 0 && dive.t >= .09) {
      const target = dive.queueTarget; dive.queued = false;
      apply(b, s, player, COMMAND.sword, target >= 0 && b.mode[target] < MODE.down ? target : flowTarget(b, s, player));
    }
  }
  if (input.cmd !== b.handled) {
    b.handled = input.cmd; s.stats.shots++; // every command issued counts as one attempt (the hints and the HUD read it)
    apply(b, s, player, input.cmdKind, input.cmdTarget);
  }
  if (dive.phase === 1 && dive.target >= 0) {
    const i = dive.target;
    if (!droneAlive(f, i) || !s.targets[i].los || !flowPaths[i] || b.mode[i] >= MODE.down) cancelStrike();
    else { const c = s.targets[i].c; aimStrike(c); if (dist(player, c) < STRIKE.contact && dive.t >= dive.minTime) landBlow(b, s, i, player); }
  }
  if (battle.quenched !== b.quenched) { b.quenched = battle.quenched; emit(b, FX.quench, -1, player, player); }
  for (let i = 0; i < f.count; i++) {
    const m = b.mode[i], p = f.pos[i], base = b.base[i];
    if (!droneAlive(f, i)) { if (m) { b.mode[i] = MODE.free; b.resist[i] = BANISH.resistance; f.held[i] = 0; } closeString(b, i); continue; }
    if (m === MODE.staggered) {
      // A wounded demon hangs where the last cut sent it; left alone, it shakes the wounds off and flies again.
      if (b.wounds[i]) reel(b, f, i, dt);
      if ((b.timer[i] -= dt) <= 0) { b.mode[i] = MODE.free; if (b.wounds[i]) { closeString(b, i); f.held[i] = 0; f.tiltX[i] = f.tiltZ[i] = 0; } }
    } else if (m === MODE.bound && b.timer[i] < 0) {
      b.timer[i] = Math.min(0, b.timer[i] + dt);
      if (b.timer[i] === 0) { b.mode[i] = MODE.cast; emit(b, FX.cast, i, player, p); }
    } else if (m === MODE.down || m === MODE.bound) {
      p.x = ease(p.x, base.x, 5, dt); p.y = ease(p.y, base.y + (m === MODE.bound ? .25 * Math.sin(b.clock * 2 + i) : 0), 5, dt); p.z = ease(p.z, base.z, 5, dt);
      f.tiltX[i] = ease(f.tiltX[i], .85, 6, dt);
      if (m === MODE.down && (b.timer[i] -= dt) <= 0) { b.mode[i] = MODE.free; b.resist[i] = BANISH.recover; f.held[i] = 0; }
    } else if (m === MODE.cast) {
      // Cast down: driven into the mountain below it (or the gorge water), faster the further it falls. It ends at the ground,
      // where the blow can be seen, not somewhere beneath it.
      const u = Math.min(1, (b.timer[i] += dt) / castDuration(i)), floor = restingHeight(base.x, base.z, 0) + BANISH.castRest;
      p.x = base.x; p.y = base.y + (Math.min(floor, base.y) - base.y) * u * u; p.z = base.z;
      if (u >= 1) {
        b.mode[i] = MODE.free; b.resist[i] = BANISH.resistance; f.held[i] = 0;
        f.phase[i] = PHASE.dying; f.phaseT[i] = 0; s.stats.kills++; s.stats.lastKillT = s.clock;
        b.armor[i] = armorFor(i); emit(b, FX.seal, i, base, p);
        if (dist(p, player) < 90) addTrauma(s.camFx, isElite(i) ? .45 : .22); // the ground takes the blow
      }
    }
  }
}
export const banishGoal = BATTLE.goal;
