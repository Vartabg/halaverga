// Shooter orchestrator step (pure, landing-safe): one call per render frame from Shooter.tsx (priority -25), after the flight
// presentation and before the suit (-20), the cannon (-19) and the camera. Idle (no input, no recent shot) leaves every feel channel
// at exactly 0 and casts no aim ray. Every per-shot channel (camera kick, cannon/body recoil, muzzle flash, tracer, crosshair pop,
// voice) starts on the frame the shot fires; the burst counter (burst.ts) attenuates them from the 4th shot of a burst.
import { HIP_HOLD, SHOT_RANGE, SNAP, aimHeld, mulberry32, threat, pushEvent, readEvents, releaseFire,
  type ShooterState, type ShotEvent, type Vec3 } from './combat';
import { adsStep, advanceCamFx } from './cameraFx';
import { advanceAssist, type AssistMemory } from './aimAssist';
import { advanceDrones, buildTargets, createDroneContext, type DroneSim } from './drones';
import { hitDrones, projectedStart, rayWater, type DroneHit } from './shotMath';
import type { ShooterWorld, WorldHit } from './shotResolve';
import { advanceSpread, advanceWeapon, spreadHalfAngle } from './weapon';
import { advanceBurst, burst } from './burst';
import { autoFire, stepAutoFire } from './autoFire';
import { fireShot, muzzleFrom, realMuzzle, type AudioSink, type StepContext } from './shooterShots';
export type { AudioSink, StepContext } from './shooterShots';
export { NEAR_MISS } from './shooterShots';

/**
 * Seconds the hip-fire arm stays raised after a shot. fireHold is exactly 1 on the press frame (held fire, or a pending press such
 * as tapShot) and while a shot is younger than ARM_HOLD, so the cannon swings onto the crosshair on the frame it fires; then it
 * decays as exp(-9 dt) (95% in 333 ms) and snaps to 0 under SNAP.
 */
export const ARM_HOLD = .8, ARM_LOWER = 9;
export function createStepContext(): StepContext {
  return { dt: 0, paused: false, reduced: false, flying: false, speed: 0, player: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 },
    firstPerson: false, strength: 1, autoFire: false, voiced: -1 };
}

const rng = mulberry32(9);
/** Rewritten in place every frame (exported so tests can check it is never replaced). */
export const droneContext = createDroneContext();
const start: Vec3 = { x: 0, y: 0, z: 0 }, toPoint: Vec3 = { x: 0, y: 0, z: 0 };
const env: WorldHit = { t: 0, normal: { x: 0, y: 1, z: 0 } }, block: WorldHit = { t: 0, normal: { x: 0, y: 1, z: 0 } };
const aimDrone: DroneHit = { index: -1, t: 0, weak: false };
/** Alternates the HUD-only blocked check between frames. */
let blockTick = 0;
const copy = (o: Vec3, a: Vec3) => { o.x = a.x; o.y = a.y; o.z = a.z; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Positional drone voices: the sink and state are parked in module variables so the hoisted callback needs no closure.
const cursor = { last: 0 };
let voiceSink: AudioSink | null = null, voiceState: ShooterState | null = null;
function voice(e: ShotEvent) {
  if (!voiceSink || !voiceState || (e.kind !== 'telegraph' && e.kind !== 'arrive' && e.kind !== 'break' && e.kind !== 'burst')) return;
  const a = voiceState.aim, x = e.from.x - a.origin.x, y = e.from.y - a.origin.y, z = e.from.z - a.origin.z, d = Math.hypot(x, y, z);
  const pan = d > 1e-6 ? clamp((x * a.right.x + y * a.right.y + z * a.right.z) / d, -1, 1) : 0;
  voiceSink(e.kind, pan, clamp(1 - d / 120, .15, 1), 0);
}

/** Crosshair point for the suit IK and the HUD: the world, water or a drone along the camera ray, from level with the head. */
function aimPoint(s: ShooterState, world: ShooterWorld, ctx: StepContext, count: number) {
  const a = s.aim, o = a.origin, d = a.dir;
  projectedStart(o, d, ctx.head, start);
  let t = world.castShot(start, d, SHOT_RANGE, env) ? env.t : Infinity;
  t = Math.min(t, rayWater(start, d));
  if (hitDrones(start, d, s.targets, count, t, aimDrone)) t = aimDrone.t;
  if (t < Infinity) { a.point.x = start.x + d.x * t; a.point.y = start.y + d.y * t; a.point.z = start.z + d.z * t; }
  else { a.point.x = o.x + d.x * SHOT_RANGE; a.point.y = o.y + d.y * SHOT_RANGE; a.point.z = o.z + d.z * SHOT_RANGE; }
  a.dist = Math.hypot(a.point.x - o.x, a.point.y - o.y, a.point.z - o.z);
}
/** True when the segment from the real muzzle to the crosshair point is blocked short of it (as resolveShot's muzzle check). */
function muzzleBlocked(s: ShooterState, world: ShooterWorld, m: Vec3) {
  const p = s.aim.point;
  const x = p.x - m.x, y = p.y - m.y, z = p.z - m.z, l = Math.hypot(x, y, z);
  if (!(l > .15)) return false;
  toPoint.x = x / l; toPoint.y = y / l; toPoint.z = z / l;
  return world.castShot(m, toPoint, l, block) && block.t < l - .15;
}

/** Advances the shooter by one render frame. `world` is the Rapier-backed query set; `audio` is one stable function. */
export function stepShooter(s: ShooterState, sim: DroneSim, mem: AssistMemory, world: ShooterWorld, ctx: StepContext, audio: AudioSink): void {
  const dt = ctx.dt > 0 ? Math.min(ctx.dt, .05) : 0;
  if (ctx.paused) return;
  s.clock += dt;
  const a = s.aim, w = s.weapon, input = s.input, fx = s.camFx;
  if (input.fireSource === 'tap' && s.clock > input.tapFireUntil) releaseFire(s, 'tap');
  stepAutoFire(s, autoFire, ctx.autoFire, dt);
  let count = s.drones.count, shotKind = '';
  if (a.valid) {
    // c. Aim state. fireHold is 1 from the press frame (the suit eases its arm weight and swings the barrel onto the line that
    // frame); the shot never waits for it. A pending press is a new serial or a press the weapon is holding for its period.
    a.blend = adsStep(a.blend, aimHeld(s), dt, ctx.reduced);
    const pending = w.lock === 0 && (input.pressSerial !== w.handledPress || w.pending);
    if (input.fire || pending || w.sinceShot < ARM_HOLD) a.fireHold = 1;
    else { a.fireHold *= Math.exp(-ARM_LOWER * dt); if (a.fireHold < SNAP) a.fireHold = 0; }
    a.combat = a.blend > .05 || input.fire || w.sinceShot < HIP_HOLD;
    // d. Weapon.
    // This frame's shots use the cone from before they fire (a rested, still ADS first shot is exact); the HUD then sees the bloom.
    advanceSpread(w, a.blend, ctx.speed, dt);
    a.spreadHalf = spreadHalfAngle(w, a.blend, ctx.speed);
    const n = advanceWeapon(w, input.fire, input.pressSerial, dt);
    advanceBurst(burst, s, n);
    if (w.justOverheated) {
      pushEvent(s, 'overheat', muzzleFrom(s, ctx, a.dir), a.origin, null); audio('overheat', 0, 1, 0); releaseFire(s, 'tap');
    }
    if (w.justVented) { pushEvent(s, 'vent', muzzleFrom(s, ctx, a.dir), a.origin, null); audio('vent', 0, 1, 0); }
    // e. Shots, against targets built from where the drones are drawn now (last frame's advance).
    if (n > 0) count = buildTargets(s);
    for (let k = 0; k < n; k++) shotKind = fireShot(s, sim, world, ctx, audio, rng, count).kind;
    if (n > 0) a.spreadHalf = spreadHalfAngle(w, a.blend, ctx.speed);
  }
  // f. Drones. Targets are rebuilt after they move, so the aim point, the assist and next frame's shots see where they are drawn.
  const c = droneContext;
  c.dt = dt; copy(c.player, ctx.player); copy(c.camera, a.origin); copy(c.aimDir, a.dir); c.aimDist = a.dist; c.ads = a.blend;
  c.threat = threat(s); c.tier = input.lookSource; c.tutorialLocked = s.stats.kills === 0; c.reduced = ctx.reduced;
  advanceDrones(s, sim, c, world.lineClear);
  count = buildTargets(s);
  if (ctx.voiced < 0) ctx.voiced = s.eventSerial;
  cursor.last = ctx.voiced; voiceSink = audio; voiceState = s;
  readEvents(s, cursor, voice);
  ctx.voiced = cursor.last; voiceSink = null; voiceState = null;
  // g. Aim point for the suit IK: only while the arm or the aim is up (exactly 0 when idle, so no ray then). The blocked glyph
  // follows the shot rule: a shot frame reports its result; with no real muzzle nothing can block; otherwise the muzzle ray (HUD
  // only) is re-cast on alternate frames and held between, so aiming costs 1.5 rays a frame on average.
  if (a.valid && (a.blend > 0 || a.fireHold > 0)) {
    aimPoint(s, world, ctx, count);
    const m = realMuzzle(s);
    if (shotKind !== '') a.blocked = shotKind === 'blocked';
    else if (!m) a.blocked = false;
    else if ((blockTick ^= 1) === 1) a.blocked = muzzleBlocked(s, world, m);
  } else a.blocked = false;
  // h. Assist and camera effects.
  advanceAssist(s, mem, a.origin, a.dir, a.fov, ctx.strength, dt);
  advanceCamFx(fx, dt, ctx.reduced, s.clock);
}
