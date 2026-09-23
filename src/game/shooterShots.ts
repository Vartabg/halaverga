// One hitscan shot for the shooter orchestrator (pure, landing-safe): spread, magnetism, resolution, damage, stats, event,
// camera kick and audio. No FOV punch on shots or kills (measured moderate-juice band: at most 4 visible channels per shot). Module scratch only: nothing allocates per shot. Called only from stepShooter (resolveShot is not re-entrant).
import { droneAlive, pushEvent, type EventKind, type ShooterState, type Vec3 } from './combat';
import type { Voice } from '@/ui/audioBus';
import { addTrauma, kick } from './cameraFx';
import { SHOT_GAIN_LATE, attenuated, burst, markShotEvent } from './burst';
import { magnetize } from './aimAssist';
import { damageDrone, nearMiss, type DroneSim } from './drones';
import { coneSample } from './shotMath';
import { resolveShot, type ShooterWorld, type ShotHit } from './shotResolve';
import { bloom01 } from './weapon';

/** Per-frame inputs from the scene. head = presentation.position + CHASE_HEAD; strength = the aimAssist setting. */
export type StepContext = {
  dt: number; paused: boolean; reduced: boolean; flying: boolean; speed: number; player: Vec3; head: Vec3;
  firstPerson: boolean; strength: number;
  /** store.autoFire: touch auto-fire allowed. */
  autoFire: boolean;
  /** Last event serial already voiced (-1 until the first step, which skips older events so a remount never replays them). */
  voiced: number;
};
export type AudioSink = (kind: Voice, pan: number, gain: number, chain: number) => void;

const dir: Vec3 = { x: 0, y: 0, z: 0 }, virtual: Vec3 = { x: 0, y: 0, z: 0 };
export const shotHit: ShotHit = { kind: 'miss', t: 0, drone: -1, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
/** Closest approach (m) at which a passing shot unsettles a live drone. */
export const NEAR_MISS = 1.5;

/** The suit muzzle once the arm is raised past .6, else null. Shots (resolveShot's muzzle check) and the HUD blocked glyph share it. */
export const realMuzzle = (s: ShooterState): Vec3 | null => s.muzzle.valid && s.muzzle.weight > .6 ? s.muzzle : null;
/** The real muzzle, else a virtual one beside the camera (first person) or the head (chase view): visual event origins only. */
export function muzzleFrom(s: ShooterState, ctx: StepContext, shotDir: Vec3): Vec3 {
  const m = realMuzzle(s), a = s.aim;
  if (m) return m;
  if (ctx.firstPerson) {
    const o = a.origin;
    virtual.x = o.x + a.right.x * .25 - a.up.x * .3 + shotDir.x * .4;
    virtual.y = o.y + a.right.y * .25 - a.up.y * .3 + shotDir.y * .4;
    virtual.z = o.z + a.right.z * .25 - a.up.z * .3 + shotDir.z * .4;
  } else {
    const h = ctx.head;
    virtual.x = h.x + a.right.x * .3 - a.up.x * .1 + a.dir.x * .5;
    virtual.y = h.y + a.right.y * .3 - a.up.y * .1 + a.dir.y * .5;
    virtual.z = h.z + a.right.z * .3 - a.up.z * .1 + a.dir.z * .5;
  }
  return virtual;
}

/** Drones whose centre passes within NEAR_MISS of the shot, before the point it stopped at, feel threatened sooner. */
function nearMisses(s: ShooterState, count: number, o: Vec3, d: Vec3, point: Vec3) {
  const reach = Math.hypot(point.x - o.x, point.y - o.y, point.z - o.z);
  for (let i = 0; i < count; i++) {
    const g = s.targets[i];
    if (!g.alive || !droneAlive(s.drones, i)) continue;
    const x = g.c.x - o.x, y = g.c.y - o.y, z = g.c.z - o.z;
    const t = Math.min(reach, Math.max(0, x * d.x + y * d.y + z * d.z));
    if (Math.hypot(x - d.x * t, y - d.y * t, z - d.z * t) < NEAR_MISS) nearMiss(s, i);
  }
}

/**
 * Fires one shot along the published camera ray (burst.index is this shot's place in the burst; it is advanced here). `count` targets were built this frame; a killed drone is marked dead in
 * s.targets so later shots in the same frame pass through it. Returns the module ShotHit (valid until the next shot).
 */
export function fireShot(s: ShooterState, sim: DroneSim, world: ShooterWorld, ctx: StepContext, audio: AudioSink,
  rng: () => number, count: number): ShotHit {
  const a = s.aim, fx = s.camFx, stats = s.stats, blend = a.blend, src = s.input.lookSource;
  coneSample(a.dir, a.spreadHalf, rng, dir);
  const magnet = magnetize(a.origin, dir, s.targets, count, blend, bloom01(s.weapon), src, ctx.strength);
  const muzzle = realMuzzle(s);
  const from = muzzleFrom(s, ctx, dir);
  const hit = resolveShot(world, a.origin, dir, ctx.head, muzzle, s.targets, count, magnet, shotHit);
  let kind: EventKind = hit.kind, drone = -1;
  if (hit.kind === 'hit' || hit.kind === 'weak') {
    drone = hit.drone;
    const r = damageDrone(s, sim, drone, hit.kind === 'weak', dir);
    if (r === 'kill') {
      kind = 'kill'; s.targets[drone].alive = false;
      stats.kills++; stats.chain = s.clock - stats.lastKillT <= 4 ? stats.chain + 1 : 1; stats.lastKillT = s.clock;
      const p = hit.point, o = a.origin, d = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
      addTrauma(fx, .45 * Math.max(0, 1 - d / 20));
    }
    stats.hits++;
  } else nearMisses(s, count, a.origin, dir, hit.point);
  stats.shots++;
  const index = burst.index++;
  pushEvent(s, kind, from, hit.point, hit.normal, drone); markShotEvent(s.eventSerial, index);
  if (!ctx.reduced) { const A = src === 'mouse' ? .35 : .2; kick(fx, A, (rng() * 2 - 1) * .4 * A); }
  audio('fire', 0, attenuated(index) ? SHOT_GAIN_LATE : 1, 0);
  if (kind === 'hit' || kind === 'weak' || kind === 'blocked') audio(kind, 0, 1, 0);
  else if (kind === 'kill') audio('kill', 0, 1, stats.chain);
  return hit;
}
