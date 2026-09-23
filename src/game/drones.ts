import { DRONE_HP, DRONE_RADIUS, EYE_RADIUS, MAX_DRONES, PHASE, SNAP, droneAlive, eyeCenter, flashGate, mulberry32, pushEvent,
  springStep, type LookSource, type ShooterState, type Vec3 } from './combat';
import { settleAngle } from './presentation';
import { START } from './motion';
import { PATROLS, flyInStart, patrolPosition } from './dronePatrols';
import { DRONE, advanceDodge, dodgeDwell, ease, lean, startTelegraph } from './droneDodge';
// Rogue 2033 security drones: passive (they never fire). They patrol, notice the player, telegraph, dodge, flinch and break apart.
// Pure and allocation-free per frame. This module and droneDodge.ts are the only writers of s.drones.
export { DRONE };
export type DroneSim = { rng: () => number; time: number; dodger: number; prev: Vec3[]; vel: Vec3[]; flyStart: Vec3[]; flyEnd: Vec3[]; flyDur: Float32Array; respawnAt: Float32Array };
/** One instance per caller, rewritten in place every frame. threat = threat(s) (auto-fire still threatens); tutorialLocked = s.stats.kills === 0. */
export type DroneContext = { dt: number; player: Vec3; camera: Vec3; aimDir: Vec3; aimDist: number; ads: number; threat: boolean; tier: LookSource; tutorialLocked: boolean; reduced: boolean };
const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const copy = (o: Vec3, a: Vec3) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
const zero = (o: Vec3) => { o.x = o.y = o.z = 0; };
export function createDroneContext(): DroneContext {
  return { dt: 0, player: v3(), camera: v3(), aimDir: { x: 0, y: 0, z: -1 }, aimDist: 250, ads: 0, threat: false, tier: 'trackpad', tutorialLocked: false, reduced: false };
}
/** Peak displacement of a unit-velocity kick on the spring (w, z): exp(-z w t*)/w with w t* = atan(sqrt(1-z^2)/z)/sqrt(1-z^2). */
const peakPerVelocity = (w: number, z: number) => { const q = Math.sqrt(1 - z * z); return Math.exp(-z * Math.atan(q / z) / q) / w; };
const KNOCK_GAIN = DRONE.knockPeak / peakPerVelocity(DRONE.knockW, DRONE.knockZ);
const WOBBLE_GAIN = DRONE.wobbleDeg * Math.PI / 180 / peakPerVelocity(DRONE.wobbleW, DRONE.wobbleZ);
const FLY_DUR = 50 / DRONE.flySpeed;
const period = (i: number) => 2 * Math.PI / PATROLS[i].omega;
function face(s: ShooterState, i: number, x: number, y: number, z: number, dt: number) {
  const f = s.drones, h = Math.hypot(x, z);
  if (h + Math.abs(y) < 1e-6) return;
  f.yaw[i] = settleAngle(f.yaw[i], Math.atan2(-x, -z), DRONE.eyeRate, dt);
  f.pitch[i] = settleAngle(f.pitch[i], Math.atan2(y, h), DRONE.eyeRate, dt);
}
export function createDroneSim(s: ShooterState, seed = 2033): DroneSim {
  const f = s.drones, list = () => Array.from({ length: MAX_DRONES }, v3);
  f.count = PATROLS.length;
  f.flashHist.fill(-Infinity); f.lastHit.fill(-1e9);
  for (let i = 0; i < f.count; i++) {
    f.patrol[i] = i; f.patrolT[i] = 0; f.phase[i] = PHASE.patrol; f.phaseT[i] = 0; f.hp[i] = DRONE_HP; f.broken[i] = 0;
    const p = patrolPosition(PATROLS[i], 0, f.pos[i]);
    copy(f.home[i], p); copy(f.anchor[i], p); copy(f.from[i], p); copy(f.to[i], p);
    const dx = START.x - p.x, dy = START.y - p.y, dz = START.z - p.z;
    f.yaw[i] = Math.atan2(-dx, -dz); f.pitch[i] = Math.atan2(dy, Math.hypot(dx, dz)); f.tiltX[i] = f.tiltZ[i] = 0;
    f.flash[i] = f.tint[i] = 0; zero(f.knock[i]); zero(f.knockV[i]); f.wobble[i] = f.wobbleV[i] = 0;
    f.dwell[i] = 0; f.cooldown[i] = 1 + i * .3; f.losT[i] = i * .04; f.los[i] = 0; f.unseenT[i] = 0; f.side[i] = 0;
  }
  const sim: DroneSim = { rng: mulberry32(seed), time: 0, dodger: -1, prev: list(), vel: list(), flyStart: list(), flyEnd: list(),
    flyDur: new Float32Array(MAX_DRONES).fill(FLY_DUR), respawnAt: new Float32Array(MAX_DRONES) };
  for (let i = 0; i < f.count; i++) copy(sim.prev[i], f.pos[i]);
  return sim;
}
const goal = v3(), spring = { x: 0, v: 0 };
/** Exact spring step that lands on exact rest inside SNAP. */
function springAxis(x: number, v: number, w: number, z: number, dt: number) {
  springStep(x, v, w, z, dt, spring); if (Math.abs(spring.x) < SNAP && Math.abs(spring.v) < SNAP) spring.x = spring.v = 0;
}
function timers(s: ShooterState, i: number, dt: number) {
  const f = s.drones, k = f.knock[i], kv = f.knockV[i], w = DRONE.knockW, z = DRONE.knockZ;
  f.flash[i] *= Math.exp(-DRONE.flashDecay * dt); if (f.flash[i] < SNAP) f.flash[i] = 0;
  if (s.clock - f.lastHit[i] > DRONE.tintHold) { f.tint[i] *= Math.exp(-DRONE.tintDecay * dt); if (f.tint[i] < SNAP) f.tint[i] = 0; }
  springAxis(k.x, kv.x, w, z, dt); k.x = spring.x; kv.x = spring.v;
  springAxis(k.y, kv.y, w, z, dt); k.y = spring.x; kv.y = spring.v;
  springAxis(k.z, kv.z, w, z, dt); k.z = spring.x; kv.z = spring.v;
  springAxis(f.wobble[i], f.wobbleV[i], DRONE.wobbleW, DRONE.wobbleZ, dt); f.wobble[i] = spring.x; f.wobbleV[i] = spring.v;
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Perception: dwell grows while a threatening aim ray covers the drone (and is not stopped short of it). */
function perceive(s: ShooterState, ctx: DroneContext, i: number, dt: number) {
  const f = s.drones, p = f.pos[i], c = ctx.camera, a = ctx.aimDir;
  if (!ctx.threat) { f.dwell[i] = Math.max(0, f.dwell[i] - dt); return; }
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz);
  const half = Math.asin(Math.min(1, DRONE_RADIUS / Math.max(d, 1e-6))) + (DRONE.coneHip + (DRONE.coneAds - DRONE.coneHip) * ctx.ads) * Math.PI / 180;
  const cos = d > 1e-6 ? (dx * a.x + dy * a.y + dz * a.z) / d : 1;
  const on = Math.acos(Math.min(1, Math.max(-1, cos))) <= half && ctx.aimDist >= d - DRONE_RADIUS;
  f.dwell[i] = on ? f.dwell[i] + dt : Math.max(0, f.dwell[i] - dt);
}
export function advanceDrones(s: ShooterState, sim: DroneSim, ctx: DroneContext, clear: (a: Vec3, b: Vec3) => boolean): void {
  const f = s.drones, dt = Math.min(.05, Math.max(0, ctx.dt || 0));
  sim.time += dt;
  let alert = 0;
  for (let i = 0; i < f.count; i++) if (f.phase[i] >= PHASE.alert && f.phase[i] <= PHASE.punish) alert++;
  for (let i = 0; i < f.count; i++) {
    const p = f.pos[i], pat = PATROLS[f.patrol[i]], ph = f.phase[i];
    f.phaseT[i] += dt;
    timers(s, i, dt);
    if (ph === PHASE.dying || ph === PHASE.dead) f.los[i] = 0;
    else if ((f.losT[i] -= dt) <= 0) {
      f.losT[i] += DRONE.losInterval;
      f.los[i] = dist(ctx.camera, p) <= DRONE.loseRange && clear(ctx.camera, p) ? 1 : 0;
    }
    const toPlayer = dist(p, ctx.player); let follow = false, eyeOnPlayer = false;
    if (ph === PHASE.patrol) {
      f.patrolT[i] = (f.patrolT[i] + dt) % period(f.patrol[i]);
      patrolPosition(pat, f.patrolT[i], goal); follow = true;
      if (toPlayer <= DRONE.alertRange && f.los[i] && alert < DRONE.maxAlert) {
        // The orbit is centred where the drone noticed the player: on its cleared path, never at the Lissajous centre.
        f.phase[i] = PHASE.alert; f.phaseT[i] = 0; f.unseenT[i] = 0; copy(f.anchor[i], p); copy(f.home[i], p); alert++;
      }
    } else if (ph === PHASE.alert) {
      const h = f.home[i], an = f.anchor[i], k = 1 - Math.min(1, dist(h, an) / DRONE.dodgeDist);
      const th = sim.time * DRONE.orbitSpeed / DRONE.orbitR + i * 1.3;
      goal.x = h.x + k * DRONE.orbitR * Math.cos(th); goal.z = h.z + k * DRONE.orbitR * Math.sin(th);
      goal.y = h.y + DRONE.bobAmp * Math.sin(2 * Math.PI * DRONE.bobHz * sim.time + i);
      h.x = ease(h.x, an.x, DRONE.homeReturn, dt); h.y = ease(h.y, an.y, DRONE.homeReturn, dt); h.z = ease(h.z, an.z, DRONE.homeReturn, dt);
      f.unseenT[i] = f.los[i] ? 0 : f.unseenT[i] + dt;
      follow = eyeOnPlayer = true;
      if (toPlayer > DRONE.loseRange || f.unseenT[i] > DRONE.loseAfter) {
        f.phase[i] = PHASE.patrol; f.phaseT[i] = 0; f.dwell[i] = 0; f.unseenT[i] = 0; alert--;
      } else {
        perceive(s, ctx, i, dt);
        if (f.dwell[i] >= dodgeDwell(ctx) && f.cooldown[i] <= 0 && sim.dodger < 0 && !(i === 0 && ctx.tutorialLocked)) {
          if (startTelegraph(s, sim, ctx, i, clear)) follow = false;
        }
      }
    } else if (ph === PHASE.telegraph || ph === PHASE.dodge || ph === PHASE.punish) {
      advanceDodge(s, sim, ctx, i, dt); eyeOnPlayer = true;
      if (ph === PHASE.punish) { copy(goal, p); follow = true; }
    } else if (ph === PHASE.dying) {
      if (f.phaseT[i] >= DRONE.hitStop) {
        pushEvent(s, 'burst', p, p, null, i);
        f.phase[i] = PHASE.dead; f.phaseT[i] = 0; sim.respawnAt[i] = sim.time + DRONE.respawn;
      }
    } else if (ph === PHASE.dead) {
      if (sim.time >= sim.respawnAt[i]) respawn(s, sim, ctx, i, clear);
      continue;
    } else if (ph === PHASE.arriving) {
      const a = sim.flyStart[i], b = sim.flyEnd[i], u = Math.min(1, f.phaseT[i] / sim.flyDur[i]), sm = u * u * u * (u * (u * 6 - 15) + 10);
      p.x = a.x + (b.x - a.x) * sm; p.y = a.y + (b.y - a.y) * sm; p.z = a.z + (b.z - a.z) * sm;
      face(s, i, b.x - a.x, b.y - a.y, b.z - a.z, dt);
      if (u >= 1) { copy(p, b); f.phase[i] = PHASE.patrol; f.phaseT[i] = 0; f.patrolT[i] = (f.patrolT[i] + sim.flyDur[i]) % period(f.patrol[i]); }
    }
    if (follow) {
      if (toPlayer < DRONE.avoid && toPlayer > 1e-6) {
        const push = (DRONE.avoid - toPlayer) / toPlayer;
        goal.x += (p.x - ctx.player.x) * push; goal.y += (p.y - ctx.player.y) * push; goal.z += (p.z - ctx.player.z) * push;
      }
      p.x = ease(p.x, goal.x, DRONE.followRate, dt); p.y = ease(p.y, goal.y, DRONE.followRate, dt); p.z = ease(p.z, goal.z, DRONE.followRate, dt);
      f.cooldown[i] -= dt;
    }
    // Frame velocity and acceleration from the previous position (reset on respawn), for the lean of every non-dodge phase.
    const q = sim.prev[i], v = sim.vel[i];
    if (dt > 0) {
      const vx = (p.x - q.x) / dt, vy = (p.y - q.y) / dt, vz = (p.z - q.z) / dt, ax = (vx - v.x) / dt, az = (vz - v.z) / dt;
      v.x = vx; v.y = vy; v.z = vz;
      if (follow || f.phase[i] === PHASE.arriving) lean(f, i, ax, az, dt);
      if (f.phase[i] === PHASE.patrol && Math.hypot(vx, vz) > .3) face(s, i, vx, 0, vz, dt);
    }
    copy(q, p);
    if (eyeOnPlayer) face(s, i, ctx.player.x - p.x, ctx.player.y - p.y, ctx.player.z - p.z, dt);
  }
}
function respawn(s: ShooterState, sim: DroneSim, ctx: DroneContext, i: number, clear: (a: Vec3, b: Vec3) => boolean) {
  const f = s.drones, start = sim.flyStart[i], end = sim.flyEnd[i];
  sim.flyDur[i] = FLY_DUR;
  patrolPosition(PATROLS[f.patrol[i]], f.patrolT[i] + FLY_DUR, end);
  let k = 0;
  while (k < 8 && !clear(flyInStart(end, ctx.player, k, start), end)) k++;
  if (k === 8) flyInStart(end, ctx.player, 0, start);
  const v = sim.vel[i]; v.x = v.y = v.z = 0; copy(f.pos[i], start); copy(sim.prev[i], start);
  zero(f.knock[i]); zero(f.knockV[i]); f.wobble[i] = f.wobbleV[i] = 0;
  f.hp[i] = DRONE_HP; f.broken[i] = 0; f.flash[i] = f.tint[i] = 0; f.dwell[i] = 0; f.unseenT[i] = 0; f.tiltX[i] = f.tiltZ[i] = 0;
  f.phase[i] = PHASE.arriving; f.phaseT[i] = 0;
  pushEvent(s, 'arrive', start, end, null, i);
}
/**
 * Applies one hit to drone i along the unit shot direction dir. The flash obeys the WCAG 2.3.1 gate (at most 3 bright peaks
 * per second); the tint is steady while hits keep coming. s.stats is the orchestrator's job.
 */
export function damageDrone(s: ShooterState, sim: DroneSim, i: number, weak: boolean, dir: Vec3): 'none' | 'hit' | 'weak' | 'kill' {
  const f = s.drones;
  if (!droneAlive(f, i)) return 'none';
  const before = f.hp[i], kv = f.knockV[i];
  f.hp[i] = before - (weak ? DRONE.weakDamage : DRONE.bodyDamage);
  if (flashGate(f.flashHist, i * 3, s.clock)) f.flash[i] = 1;
  f.tint[i] = DRONE.tint; f.lastHit[i] = s.clock;
  kv.x += dir.x * KNOCK_GAIN; kv.y += dir.y * KNOCK_GAIN; kv.z += dir.z * KNOCK_GAIN;
  f.wobbleV[i] += (sim.rng() < .5 ? -1 : 1) * WOBBLE_GAIN;
  if (before > DRONE.breakAt && f.hp[i] <= DRONE.breakAt && !f.broken[i]) { f.broken[i] = 1; pushEvent(s, 'break', f.pos[i], f.pos[i], null, i); }
  if (f.hp[i] <= 0) {
    f.phase[i] = PHASE.dying; f.phaseT[i] = 0;
    if (sim.dodger === i) sim.dodger = -1;
    return 'kill';
  }
  // A weakpoint hit during the telegraph staggers the drone: no dodge, straight to PUNISH.
  if (weak && f.phase[i] === PHASE.telegraph) { f.phase[i] = PHASE.punish; f.phaseT[i] = 0; sim.dodger = -1; }
  return weak ? 'weak' : 'hit';
}
/** A shot passed within DRONE.nearMiss of live drone i: it feels threatened sooner. */
export function nearMiss(s: ShooterState, i: number): void { if (droneAlive(s.drones, i)) s.drones.dwell[i] += DRONE.nearMissDwell; }
/** Fills s.targets[0..count) for the shot resolver and the aim assist; returns count. */
export function buildTargets(s: ShooterState): number {
  const f = s.drones;
  for (let i = 0; i < f.count; i++) {
    const t = s.targets[i], p = f.pos[i], k = f.knock[i];
    t.c.x = p.x + k.x; t.c.y = p.y + k.y; t.c.z = p.z + k.z; t.r = DRONE_RADIUS;
    eyeCenter(f, i, t.eye); t.eyeR = EYE_RADIUS; t.alive = droneAlive(f, i); t.los = f.los[i] === 1;
  }
  return f.count;
}
