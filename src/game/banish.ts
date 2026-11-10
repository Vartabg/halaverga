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
export { crosshairTarget } from './combatFlow';
import { BANISH, MODE, FX, type BanishState } from './banishState';
import { cue, dist, emit, interrupt, jolt, throwDown } from './banishHits';
import { landBlow } from './swordBlow';
import { closeString, pressTarget, stepInTime } from './swordString';
import { THROWN, reelDemon, spikeDemon, type Impact } from './thrown';
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
  b.quenched = battle.quenched; s.drones.held.fill(0); b.wounds.fill(0); b.string.target = -1;
  b.vel.forEach(v => { v.x = v.y = v.z = 0; }); b.spin.fill(0); b.hit.fill(0); b.struck.fill(0);
  resetWardens(b.wardens);
}
/** The visible, reachable demon most aligned with the view; excludes targets already being banished. */
export function reticleTarget(b: BanishState, s: ShooterState) {
  return flowTarget(b, s, s.aim.origin);
}
/** Click / tap always requests a sword launch; binding and casting follow a landed hit automatically. */
export function contextKind(b: BanishState, i: number, d: number) {
  void b; void i; void d;
  return COMMAND.sword;
}
function apply(b: BanishState, s: ShooterState, player: Vec3, kind: number, target: number) {
  // A press with no chosen demon continues the string in progress before it looks for a new demon (swordString.pressTarget).
  const i = target >= 0 ? target : kind === COMMAND.rebuke ? flowTarget(b, s, player, true) : pressTarget(b, s, player);
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
    jolt(s, i, player, 9); interrupt(s, i); b.guardTime[i] = 0; b.retaliate[i] = 0; f.held[i] = b.wounds[i] ? 1 : 0; b.cool = BANISH.rebukeCool; b.rebukeT = b.clock;
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
    const windup = stepInTime(b, i, d);
    beginStrike(i, p, d, windup); s.weapon.sinceShot = 0;
    if (!windup) punchFov(s.camFx, 'kill', 9); // the launch widens the view: speed you can feel
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
    b.mode[i] = MODE.cast; b.timer[i] = 0; b.hit[i] = 0; b.struck[i] = 0; closeString(b, i); b.base[i].x = p.x; b.base[i].y = p.y; b.base[i].z = p.z;
    emit(b, FX.cast, i, player, p);
    return;
  }
  if (b.resist[i] <= 0 && b.mode[i] <= MODE.staggered) throwDown(b, s, i);
}
const ease = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);
const at: Vec3 = { x: 0, y: 0, z: 0 }, off: Vec3 = { x: 0, y: 0, z: 0 };
/** A thrown demon struck something hard enough to matter: the effect (drawn on the surface it struck), and a shake by how hard
 * and how near. True when it landed (ground or water), not when it hit a cliff face or another demon. */
function struck(b: BanishState, s: ShooterState, i: number, hit: Impact | null, player: Vec3) {
  if (!hit || hit.speed < THROWN.thud) return false;
  at.x = hit.x; at.y = hit.y; at.z = hit.z; off.x = hit.x + hit.nx; off.y = hit.y + hit.ny; off.z = hit.z + hit.nz;
  // A shove between demons is drawn dim and does not shake the view: only the mountain takes the full effect.
  emit(b, FX.impact, i, off, at, Math.round(hit.other < 0 ? hit.speed : Math.min(hit.speed, 15)));
  if (hit.other < 0) addTrauma(s.camFx, Math.min(.5, hit.speed / 110) * Math.max(0, 1 - dist(at, player) / 90));
  return hit.other < 0 && hit.ny > .5; // ground or water: a cliff face throws it back, it has not landed
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
      apply(b, s, player, COMMAND.sword, target >= 0 && b.mode[target] < MODE.down ? target : -1);
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
      if (b.wounds[i]) struck(b, s, i, reelDemon(b, s, i, dt), player);
      if ((b.timer[i] -= dt) <= 0) { b.mode[i] = MODE.free; if (b.wounds[i]) { closeString(b, i); f.held[i] = 0; f.tiltX[i] = f.tiltZ[i] = 0; } }
    } else if (m === MODE.bound && b.timer[i] < 0) {
      b.timer[i] = Math.min(0, b.timer[i] + dt);
      if (b.timer[i] === 0) { b.mode[i] = MODE.cast; emit(b, FX.cast, i, player, p); }
    } else if (m === MODE.down || m === MODE.bound) {
      p.x = ease(p.x, base.x, 5, dt); p.y = ease(p.y, base.y + (m === MODE.bound ? .25 * Math.sin(b.clock * 2 + i) : 0), 5, dt); p.z = ease(p.z, base.z, 5, dt);
      f.tiltX[i] = ease(f.tiltX[i], .85, 6, dt);
      if (m === MODE.down && (b.timer[i] -= dt) <= 0) { b.mode[i] = MODE.free; b.resist[i] = BANISH.recover; f.held[i] = 0; }
    } else if (m === MODE.cast) {
      let done: boolean;
      if (isElite(i)) {
        // A warden's rite: lowered to the ground below it over the length of the casting.
        const u = Math.min(1, (b.timer[i] += dt) / castDuration(i)), floor = restingHeight(base.x, base.z, 0) + BANISH.castRest;
        p.x = base.x; p.y = base.y + (Math.min(floor, base.y) - base.y) * u * u; p.z = base.z; done = u >= 1;
      } else {
        // Cast down for real: the blow's velocity, gravity and the mountain decide where it strikes (thrown.ts). It lies there a
        // moment, then it is gone.
        b.timer[i] += dt;
        if (struck(b, s, i, spikeDemon(b, s, i, dt), player) && !b.hit[i]) {
          b.hit[i] = b.clock; const v = b.vel[i]; v.x *= THROWN.spent; v.y *= THROWN.spent; v.z *= THROWN.spent; // it lies where it landed
        }
        done = b.hit[i] > 0 && b.clock - b.hit[i] >= THROWN.settle || b.timer[i] > THROWN.timeout;
      }
      if (done) {
        b.mode[i] = MODE.free; b.resist[i] = BANISH.resistance; f.held[i] = 0; b.hit[i] = 0;
        f.phase[i] = PHASE.dying; f.phaseT[i] = 0; s.stats.kills++; s.stats.lastKillT = s.clock;
        b.armor[i] = armorFor(i); emit(b, FX.seal, i, base, p);
        if (isElite(i) && dist(p, player) < 90) addTrauma(s.camFx, .45); // the ground takes the blow
      }
    }
  }
}
export const banishGoal = BATTLE.goal;
