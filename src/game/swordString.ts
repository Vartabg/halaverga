// The sword string (Garo 2026-11-09: strikes need sequencing). A lesser demon is cast down by three cuts, each its own move with its
// own weight: the cross cut that opens (the dive), the rising cut that lifts the demon, and the casting blow that drives it down.
// The angel stays on the demon between cuts and gets its speed back on the last one. Game fiction. Pure: plain {x,y,z}.
import type { ShooterState, Vec3 } from './combat';
import { BANISH, MODE, type BanishState } from './banishState';
import { isElite } from './encounter';

/**
 * windup: seconds the step-in takes before the blade lands (the opener is the dive itself). freeze: the hit-stop. along / lift: how
 * far the cut shoves the demon along the blow and upward (m/s, decaying). back / rise: the angel's own drift after the cut, so it
 * ends where the next cut starts (above the demon for the last one). arc: the slash's angle and size on screen. rate: cut speed.
 */
export type Cut = { name: string; windup: number; freeze: number; along: number; lift: number; back: number; rise: number;
  trauma: number; fov: number; kick: number; arc: number; arcScale: number; rate: number; roll: number;
  /** The whole body's move, seen from behind where the arms are hidden by the wings: turns about the spine (twirl) or across it
   * (flip), over `spin` seconds. A lean (less than a full turn) goes out and comes back. */
  twirl: number; flip: number; spin: number };
export const CUTS: readonly Cut[] = [
  { name: 'Cross cut', windup: 0, freeze: .055, along: 9, lift: 1.5, back: 3, rise: 0, trauma: .32, fov: 4, kick: 1, arc: .18, arcScale: 1, rate: 1.7, roll: .35, twirl: 1, flip: 0, spin: .34 },
  { name: 'Rising cut', windup: .17, freeze: .08, along: 2.5, lift: 15, back: 1, rise: 24, trauma: .45, fov: 5, kick: -1.8, arc: -1.02, arcScale: 1.25, rate: 2, roll: -.5, twirl: 0, flip: -.17, spin: .36 },
  { name: 'Casting blow', windup: .24, freeze: .14, along: 3, lift: 0, back: 0, rise: 0, trauma: .85, fov: 9, kick: 2.8, arc: Math.PI / 2, arcScale: 1.55, rate: 1.3, roll: 0, twirl: 0, flip: 1, spin: .4 },
];
/** cuts: how many a lesser demon takes. window: seconds the next cut stays open. recover: a demon left alone shakes its wounds off. */
/** finish: after the last cut the angel hangs over the blow this long before it is released. */
export const STRING = { cuts: 3, window: 1.15, recover: 2.6, lock: .28, decay: 5.5, finish: .2 } as const;
export const LAST = STRING.cuts - 1;

/** Which cut lands on this demon now. A warden's armour counts as its first two cuts, so its exposed blow is the casting blow. */
export function cutFor(b: BanishState, i: number, guarded = false, armorBefore = 0) {
  if (isElite(i)) return guarded ? (armorBefore >= 2 ? 0 : 1) : LAST;
  return Math.min(LAST, b.wounds[i]);
}
/** True while the string on demon i is still open: the next press steps in for the next cut instead of diving afresh. */
export const stringOpen = (b: BanishState, i: number) => b.string.target === i && b.clock <= b.string.until && b.wounds[i] > 0;

/**
 * The demon a press with no chosen target continues on: the one being cut, while its string is open and it is still ahead of the
 * view. Looking away from it (to another demon) lets the usual choice take over, which is how a string is broken off on purpose.
 */
export function stringTarget(b: BanishState, s: ShooterState, player: Vec3) {
  const i = b.string.target;
  if (i < 0 || !stringOpen(b, i) || b.mode[i] >= MODE.down || !s.targets[i]?.alive) return -1;
  const c = s.targets[i].c, x = c.x - player.x, y = c.y - player.y, z = c.z - player.z, d = Math.hypot(x, y, z);
  if (d > BANISH.swordReach) return -1;
  if (d < 6 || !s.aim.valid) return i; // Close in, the camera frames the pair: the string never slips off the demon in front.
  return (x * s.aim.dir.x + y * s.aim.dir.y + z * s.aim.dir.z) / d > .35 ? i : -1;
}
/** Records a cut that was not the last: the wound, the shove, and the string left open on this demon. */
export function woundDemon(b: BanishState, i: number, dir: Vec3, cut: Cut, entrySpeed: number) {
  if (b.string.target !== i || b.clock > b.string.until) b.string.speed = entrySpeed; // the speed the opener arrived with
  b.wounds[i]++; b.string.target = i; b.string.until = b.clock + STRING.window;
  const p = b.pop[i]; p.x = dir.x * cut.along; p.y = dir.y * cut.along + cut.lift; p.z = dir.z * cut.along;
}
export function closeString(b: BanishState, i: number) { b.wounds[i] = 0; if (b.string.target === i) b.string.target = -1; const p = b.pop[i]; p.x = p.y = p.z = 0; }
/** A wounded demon drifts where the last cut sent it, slowing as it goes: it hangs in the air for the next cut. */
export function stepPop(b: BanishState, pos: Vec3, i: number, dt: number) {
  const p = b.pop[i], k = Math.exp(-STRING.decay * dt);
  pos.x += p.x * dt; pos.y += p.y * dt; pos.z += p.z * dt; p.x *= k; p.y *= k; p.z *= k;
}
/** How a demon carries each wound: knocked askew by the cross cut, thrown onto its back by the rising cut. */
export const REEL = [{ x: 0, z: 0 }, { x: .5, z: .75 }, { x: -1.2, z: -.25 }] as const;
type Reeling = { pos: Vec3[]; tiltX: Float32Array; tiltZ: Float32Array };
export function reel(b: BanishState, f: Reeling, i: number, dt: number) {
  stepPop(b, f.pos[i], i, dt);
  const to = REEL[Math.min(REEL.length - 1, b.wounds[i])], k = 1 - Math.exp(-10 * dt), side = i % 2 ? -1 : 1;
  f.tiltX[i] += (to.x - f.tiltX[i]) * k; f.tiltZ[i] += (to.z * side - f.tiltZ[i]) * k;
}
