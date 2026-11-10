// Shared pieces of the fight's blows (banish.ts consumes commands, swordBlow.ts lands the sword): the effect ring, the on-screen
// cue, and how a demon reacts to being struck, interrupted or thrown down. Pure and allocation-free per frame.
import { PHASE, flashGate, type ShooterState, type Vec3 } from './combat';
import { battle } from './celestialBattle';
import { BANISH, MODE, FX, type BanishState, type Cue } from './banishState';
import { closeString } from './swordString';

export function emit(b: BanishState, kind: number, drone: number, from: Vec3, to: Vec3, n = 0) {
  const e = b.fx[b.fxSerial % b.fx.length];
  e.serial = ++b.fxSerial; e.kind = kind; e.t = b.clock; e.drone = drone; e.n = n;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.to.x = to.x; e.to.y = to.y; e.to.z = to.z;
}
export const cue = (b: BanishState, c: Cue) => { b.cue = c; b.cueT = b.clock; };
export const dist = (a: Vec3, c: Vec3) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);

/** Shared reaction to a rebuke or a sword stroke: a flash (WCAG-gated), a shove away from the angel and a convulsion. */
export function jolt(s: ShooterState, i: number, from: Vec3, wobble: number) {
  const f = s.drones, p = f.pos[i], d = dist(p, from) || 1;
  if (flashGate(f.flashHist, i * 3, s.clock)) f.flash[i] = 1;
  f.tint[i] = .35; f.lastHit[i] = s.clock;
  f.knockV[i].x += (p.x - from.x) / d * 4; f.knockV[i].y += (p.y - from.y) / d * 4 + 1; f.knockV[i].z += (p.z - from.z) / d * 4;
  f.wobbleV[i] += (f.wobbleV[i] > 0 ? -1 : 1) * wobble;
  s.stats.hits++; // the controls hints count a landed command as a hit
  s.weapon.sinceShot = 0; // the arm rises toward the crosshair, as a command gesture (suitBlaster's hip hold)
}
/** A charging demon that is rebuked, thrown down or bound loses its cast; the host pauses before the next one. */
export function interrupt(s: ShooterState, i: number) {
  const f = s.drones;
  if (f.phase[i] === PHASE.telegraph || f.phase[i] === PHASE.dodge || f.phase[i] === PHASE.punish) { f.phase[i] = PHASE.alert; f.phaseT[i] = 0; }
  if (battle.charging === i) { battle.charging = -1; battle.nextAttack = battle.clock + 1.5; }
}
export function throwDown(b: BanishState, s: ShooterState, i: number) {
  const f = s.drones, p = f.pos[i], base = b.base[i];
  b.mode[i] = MODE.down; b.timer[i] = BANISH.downTime; f.held[i] = 1; interrupt(s, i); closeString(b, i); // thrown down, its string is over
  base.x = p.x; base.y = p.y - BANISH.downDrop; base.z = p.z;
  emit(b, FX.down, i, p, base);
}
