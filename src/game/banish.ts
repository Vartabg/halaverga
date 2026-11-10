// The fight (docs/research/combat-texts.md): demons are not shot. They are rebuked by a word (Mark 1:25, Jude 9), struck
// with a flaming sword (Genesis 3:24), bound with a chain once thrown down (Revelation 20:2, 1 Enoch 10:4) and cast into the abyss,
// which seals over them (Revelation 20:3). Game fiction built on those texts. Pure and allocation-free per frame; the scene chunk
// only. The ordered ritual is compressed into an automatic finisher so flight and sword attacks can chain.
import { PHASE, droneAlive, flashGate, type ShooterState, type Vec3 } from './combat';
import { COMMAND } from './commands';
import { battle, BATTLE } from './celestialBattle';
import { addTrauma, kick, punchFov } from './cameraFx';
import { STRIKE, aimStrike, beginStrike, cancelStrike, landStrike, strike as dive } from './strike';

export { BANISH, MODE, FX, REBUKE_LINE, createBanish, banish, type BanishFx, type BanishState, type Cue } from './banishState';
import { BANISH, MODE, FX, type BanishState, type Cue } from './banishState';
import { flowPaths, flowTarget } from './combatFlow';
import { armorFor, bindDuration, castDuration, isElite } from './encounter';
import { absorbEliteStrike, stepEliteGuards } from './eliteCombat';
import { resetWardens } from './wardenState';
import { interruptWarden } from './wardenAttacks';
import { reserveWardenCounter } from './wardenCounter';
/** Clears every demon's state (regroup, unmount). Pending commands are dropped, not replayed. */
export function resetBanish(b: BanishState, s: ShooterState) {
  b.mode.fill(0); b.resist.fill(BANISH.resistance); b.timer.fill(0); b.cool = 0; b.handled = s.input.cmd; b.cue = ''; b.last = -1; b.resetRequested = false;
  b.combo = 0; b.comboUntil = 0; b.guardTime.fill(0); b.retaliate.fill(0); b.armor.forEach((_, i) => { b.armor[i] = armorFor(i); }); cancelStrike();
  b.quenched = battle.quenched; s.drones.held.fill(0);
  resetWardens(b.wardens);
}
function emit(b: BanishState, kind: number, drone: number, from: Vec3, to: Vec3) {
  const e = b.fx[b.fxSerial % b.fx.length];
  e.serial = ++b.fxSerial; e.kind = kind; e.t = b.clock; e.drone = drone;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.to.x = to.x; e.to.y = to.y; e.to.z = to.z;
}
const cue = (b: BanishState, c: Cue) => { b.cue = c; b.cueT = b.clock; };
const dist = (a: Vec3, c: Vec3) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);

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
/** Shared reaction to a rebuke or a sword stroke: a flash (WCAG-gated), a shove away from the angel and a convulsion. */
function strike(s: ShooterState, i: number, from: Vec3, wobble: number) {
  const f = s.drones, p = f.pos[i], d = dist(p, from) || 1;
  if (flashGate(f.flashHist, i * 3, s.clock)) f.flash[i] = 1;
  f.tint[i] = .35; f.lastHit[i] = s.clock;
  f.knockV[i].x += (p.x - from.x) / d * 4; f.knockV[i].y += (p.y - from.y) / d * 4 + 1; f.knockV[i].z += (p.z - from.z) / d * 4;
  f.wobbleV[i] += (f.wobbleV[i] > 0 ? -1 : 1) * wobble;
  s.stats.hits++; // the controls hints count a landed command as a hit
  s.weapon.sinceShot = 0; // the arm rises toward the crosshair, as a command gesture (suitBlaster's hip hold)
}
/** A charging demon that is rebuked, thrown down or bound loses its cast; the host pauses before the next one. */
function interrupt(s: ShooterState, i: number) {
  const f = s.drones;
  if (f.phase[i] === PHASE.telegraph || f.phase[i] === PHASE.dodge || f.phase[i] === PHASE.punish) { f.phase[i] = PHASE.alert; f.phaseT[i] = 0; }
  if (battle.charging === i) { battle.charging = -1; battle.nextAttack = battle.clock + 1.5; }
}
function throwDown(b: BanishState, s: ShooterState, i: number) {
  const f = s.drones, p = f.pos[i], base = b.base[i];
  b.mode[i] = MODE.down; b.timer[i] = BANISH.downTime; f.held[i] = 1; interrupt(s, i);
  base.x = p.x; base.y = p.y - BANISH.downDrop; base.z = p.z;
  emit(b, FX.down, i, p, base);
}
function apply(b: BanishState, s: ShooterState, player: Vec3, kind: number, target: number) {
  const i = target >= 0 ? target : flowTarget(b, s, player, kind === COMMAND.rebuke);
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
    strike(s, i, player, 9); interrupt(s, i); b.guardTime[i] = 0; b.retaliate[i] = 0; f.held[i] = 0; b.cool = BANISH.rebukeCool; b.rebukeT = b.clock;
    if (isElite(i)) interruptWarden(b, s, i);
    emit(b, FX.rebuke, i, player, p);
  } else if (kind === COMMAND.sword) {
    if (b.guardTime[i] > 0) { cue(b, 'guarded'); return; }
    if (m >= MODE.down) { cue(b, m === MODE.down ? 'notBound' : ''); return; }
    if (d > BANISH.swordReach) { cue(b, 'far'); return; }
    if (dive.phase === 1 || dive.freeze > 0 || dive.phase === 2 && dive.t < .09) {
      dive.queued = true; dive.queueTarget = target; dive.queueTime = .75; return;
    }
    // The angel dives at the demon (strike.ts); the blow lands on contact, in stepBanish.
    beginStrike(i, p, d); s.weapon.sinceShot = 0; punchFov(s.camFx, 'kill', 9); // the launch widens the view: speed you can feel
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

/** The sword connects at the end of a dive: the blow, a shove along the dive, a freeze and a camera jolt. */
function landBlow(b: BanishState, s: ShooterState, i: number, player: Vec3) {
  const f = s.drones;
  const armor = b.armor[i];
  const guarded = absorbEliteStrike(b, s, i);
  const repelled = guarded && isElite(i) && armor === b.armor[i];
  if (!guarded) b.resist[i] = 0; // Lesser demons retain the fast finisher; elite armor gets a real exchange.
  b.combo = b.clock <= b.comboUntil ? b.combo + 1 : 1; b.comboUntil = b.clock + 4;
  strike(s, i, player, 9);
  f.knockV[i].x += dive.dir.x * 10; f.knockV[i].y += dive.dir.y * 10; f.knockV[i].z += dive.dir.z * 10;
  addTrauma(s.camFx, .5); punchFov(s.camFx, 'kill', 6); kick(s.camFx, 1.6, 0);
  landStrike(guarded || !isElite(i), isElite(i) ? repelled ? .07 : .11 : STRIKE.freeze); emit(b, FX.sword, i, player, f.pos[i]);
  interrupt(s, i);
  if (guarded) {
    if (repelled) cue(b, 'guarded');
    dive.carrySpeed = 24; dive.dir.x *= -1; dive.dir.y *= -1; dive.dir.z *= -1;
    emit(b, FX.armor, i, player, f.pos[i]); return;
  }
  f.held[i] = 1; b.mode[i] = MODE.bound; b.timer[i] = -bindDuration(i);
  Object.assign(b.base[i], f.pos[i]); emit(b, FX.bind, i, player, f.pos[i]);
}
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
    else { const c = s.targets[i].c; aimStrike(c); if (dist(player, c) < STRIKE.contact) landBlow(b, s, i, player); }
  }
  if (battle.quenched !== b.quenched) { b.quenched = battle.quenched; emit(b, FX.quench, -1, player, player); }
  for (let i = 0; i < f.count; i++) {
    const m = b.mode[i], p = f.pos[i], base = b.base[i];
    if (!droneAlive(f, i)) { if (m) { b.mode[i] = MODE.free; b.resist[i] = BANISH.resistance; f.held[i] = 0; } continue; }
    if (m === MODE.staggered) {
      if ((b.timer[i] -= dt) <= 0) b.mode[i] = MODE.free;
    } else if (m === MODE.bound && b.timer[i] < 0) {
      b.timer[i] = Math.min(0, b.timer[i] + dt);
      if (b.timer[i] === 0) { b.mode[i] = MODE.cast; emit(b, FX.cast, i, player, p); }
    } else if (m === MODE.down || m === MODE.bound) {
      p.x = ease(p.x, base.x, 5, dt); p.y = ease(p.y, base.y + (m === MODE.bound ? .25 * Math.sin(b.clock * 2 + i) : 0), 5, dt); p.z = ease(p.z, base.z, 5, dt);
      f.tiltX[i] = ease(f.tiltX[i], .85, 6, dt);
      if (m === MODE.down && (b.timer[i] -= dt) <= 0) { b.mode[i] = MODE.free; b.resist[i] = BANISH.recover; f.held[i] = 0; }
    } else if (m === MODE.cast) {
      const u = (b.timer[i] += dt) / castDuration(i);
      p.x = base.x; p.y = base.y - Math.max(BANISH.castDepth, base.y + 6) * u * u; p.z = base.z;
      if (u >= 1) {
        b.mode[i] = MODE.free; b.resist[i] = BANISH.resistance; f.held[i] = 0;
        f.phase[i] = PHASE.dying; f.phaseT[i] = 0; s.stats.kills++; s.stats.lastKillT = s.clock;
        b.armor[i] = armorFor(i); emit(b, FX.seal, i, base, base);
      }
    }
  }
}
export const banishGoal = BATTLE.goal;
