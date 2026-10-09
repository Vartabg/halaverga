import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { makeCity } from '../../src/world/cityData';
import { makeField } from '../../src/world/fieldData';
import { FlightSafety } from '../../src/game/FlightSafety';
import { advanceVelocity, boundMovement, flightTarget, moving, START, WORLD, FOOT, type Vec } from '../../src/game/motion';
import { boundaryDistance, CLEARANCE, removeInward } from '../../src/game/navigation';
import { limitStep, resetCueHold } from '../../src/game/limitStep';
import { readScrape } from '../../src/game/scrape';
import { resetLimitSteer } from '../../src/game/limitSteer';
import { driveLimits } from '../../src/game/limitDrive';
import { applyEdgeTurns, thumbTurn, resetEdgeTurns } from '../../src/game/edgeTurn';
import { carve, resetCarve } from '../../src/game/carve';
import { runtime, readIntent } from '../../src/game/runtime';
import { BOUNDARY_GROUPS } from '../../src/game/combat';
import { thumbThrottle } from '../../src/game/thumbFlight';
import { useGame } from '../../src/game/store';
// Headless port of Player.tsx's physics step (same order, same real modules) plus a real Rapier world with the city and the six
// invisible boundary colliders. Ported from the limits investigation (2026-09-28, base 67d61d2). tests/limit-*.test.ts drive it.
// The limits code is shared, not copied: driveLimits (limitDrive.ts: S1/S5b/S6, skipped by opts.steerOff) and limitStep (S2/S5a/S3) are the
// same calls Player.tsx makes, and readScrape is the same controller read. Keep the two call sites in the same order.

export const DT = 1 / 60;
export type Model = Look & (
  | { kind: 'thumb'; forward: number; edgeTurn: number; edgePitch: number }      // classic one finger, finger held at an edge
  | { kind: 'cursor'; throttle: number; edgeTurn: number; edgePitch: number }    // desktop free cursor cruise
  | { kind: 'keys'; keys: string[]; surge?: boolean; edgeTurn?: number }         // WASD (simple profile / keyboard)
  | { kind: 'idle' });
/** Slide-look on top of any model: a yaw and pitch rate (rad/s) written into the view every step, as look() does between steps. */
export type Look = { look?: number; lookPitch?: number };
let cityCache: ReturnType<typeof makeCity>['solids'] | null = null;
/** The district and, since 2026-10-06, the flyable ruins around it (fieldData.ts): the flight tests fly the whole world. */
export async function init() {
  await RAPIER.init();
  if (!cityCache) { const c = makeCity(), f = makeField(); cityCache = [...c.solids, ...f.solids]; c.geometry.dispose(); f.geometries.forEach(g => g.dispose()); }
}
export function solids() { return cityCache!; }
export class Sim {
  world: RAPIER.World; body: RAPIER.RigidBody; col: RAPIER.Collider; c: RAPIER.KinematicCharacterController; safe: FlightSafety;
  p: Vec; v: Vec = { x: 0, y: 0, z: 0 }; yaw = 0; pitch = -.12; t = 0; epoch = 0;
  lastMoveClear = false; lastContact = false; lastCollisions = 0; flying = true;
  /** Twin touch level flight (view pitch is aim only) and a held trigger: what Player.tsx passes limitSteer as pitchFlies / aiming. */
  level = false; aiming = false;
  contact = { active: false, normal: { x: 0, y: 1, z: 0 } }; scrape = { active: false, normal: { x: 0, y: 1, z: 0 } }; cueNow = '' as string;
  constructor(pos: Vec, opts: { boundary?: boolean; city?: boolean } = {}) {
    const world = this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    if (opts.city !== false) for (const s of cityCache!) world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size).setTranslation(...s.position).setRotation(new Quaternion().setFromEuler(new Euler(...s.rotation))));
    if (opts.boundary !== false) {
      const width = WORLD.maxX - WORLD.minX, depth = WORLD.maxZ - WORLD.minZ, cz = (WORLD.minZ + WORLD.maxZ) / 2;
      const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
        world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(BOUNDARY_GROUPS));
      const wh = (WORLD.ceiling + 45) / 2, wy = (WORLD.ceiling - 35) / 2; // DistrictBoundary's WALL_HALF and WALL_Y
      add(1, wh, depth / 2 + 4, WORLD.minX - 1.44, wy, cz); add(1, wh, depth / 2 + 4, WORLD.maxX + 1.44, wy, cz);
      add(width / 2 + 4, wh, 1, 0, wy, WORLD.minZ - 1.44); add(width / 2 + 4, wh, 1, 0, wy, WORLD.maxZ + 1.44);
      add(width / 2 + 4, 1, depth / 2 + 4, 0, WORLD.ceiling + 2.04, cz); add(width / 2 + 4, 1, depth / 2 + 4, 0, -1.4, cz);
    }
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    this.col = world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), this.body);
    this.c = world.createCharacterController(CLEARANCE.margin); this.c.setSlideEnabled(true);
    this.c.disableSnapToGround(); this.c.disableAutostep(); this.c.setMaxSlopeClimbAngle(Math.PI / 2); this.c.setMinSlopeSlideAngle(0);
    world.step(); this.safe = new FlightSafety(world, RAPIER, this.col); this.p = { ...pos };
    resetEdgeTurns(); resetCarve(); resetLimitSteer(); resetCueHold(); this.reset();
  }
  reset() {
    runtime.keys.clear(); Object.assign(runtime.thumb, { active: false, throttle: 0, strafe: 0, edgeTurn: 0, edgePitch: 0 });
    Object.assign(runtime.trackpad, { active: false, edgeTurn: 0, edgePitch: 0, edgeAge: 0, outside: 0, outsideAge: 0, throttle: 8 / 34 });
    runtime.surge = false; runtime.landGoal = null; runtime.shooter.aim.blend = 0;
  }
  setModel(m: Model) {
    this.reset(); useGame.setState({ trackpadSteering: m.kind === 'keys' ? 'simple' : 'free' });
    if (m.kind === 'thumb') Object.assign(runtime.thumb, { active: true, throttle: m.forward, edgeTurn: m.edgeTurn, edgePitch: m.edgePitch });
    else if (m.kind === 'cursor') Object.assign(runtime.trackpad, { active: true, throttle: m.throttle, edgeTurn: m.edgeTurn, edgePitch: m.edgePitch, edgeAge: 0 });
    else if (m.kind === 'keys') { m.keys.forEach(k => runtime.keys.add(k)); runtime.surge = !!m.surge; if (m.edgeTurn) { Object.assign(runtime.thumb, { active: false }); } }
  }
  /** One Player.tsx physics step, same order and same real modules. */
  step(m: Model, opts: { steerOff?: boolean } = {}) {
    const dt = DT, p = this.body.translation();
    runtime.yaw = this.yaw; runtime.pitch = this.pitch;
    const st = { reduced: false, shooter: false, sustainedEdges: true } as any;
    if (m.kind === 'cursor') { runtime.trackpad.edgeAge = 0; runtime.trackpad.edgeTurn = m.edgeTurn; runtime.trackpad.edgePitch = m.edgePitch; runtime.trackpad.throttle = m.throttle; }
    // Slide-look between steps (runtime.look: the view moves before the physics step reads it).
    if (m.look) runtime.yaw += m.look * dt;
    if (m.lookPitch) runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch + m.lookPitch * dt));
    applyEdgeTurns(dt, st); thumbTurn(dt);
    // arrow keys yaw (blaster off) -> not used
    const intent = readIntent();
    const gestureThrust = runtime.thumb.active || (runtime.trackpad.active && useGame.getState().trackpadSteering !== 'simple');
    const surge = runtime.surge || gestureThrust;
    // S1/S5b/S6 (Player.tsx: the same driveLimits call before the flight target): the limit heading nudge.
    if (!opts.steerOff) driveLimits(runtime, { on: true, dt, p, v: this.v, speed: this.speed, intent, surge, level: this.level, aiming: this.aiming, contact: this.contact, scrape: this.scrape, safe: this.safe });
    const fp = this.level ? 0 : runtime.pitch;
    const vb = { ...this.v };
    carve(vb, runtime.yaw, dt, this.flying && !runtime.thumb.active && (moving(intent) || surge), this.epoch);
    let v = advanceVelocity(vb, intent, runtime.yaw, fp, this.flying, surge, dt);
    const chosen = { ...v };
    // S2/S5a/S3 (Player.tsx: the same limitStep): soft limiter, solid look-ahead, full-speed slide, cue.
    const lim = limitStep(this.safe, p, v, flightTarget(intent, runtime.yaw, fp, this.flying, surge), this.v);
    v = lim.velocity; this.lastContact = !!lim.contact; this.cueNow = lim.cue;
    this.contact = { active: !!lim.contact, normal: lim.contact ? { ...lim.contact.normal1 } : this.contact.normal };
    this.v = { ...v };
    const movement = boundMovement(p, { x: v.x * dt, y: v.y * dt, z: v.z * dt }, this.flying);
    this.c.computeColliderMovement(this.col, movement);
    const actual = this.c.computedMovement(); readScrape(this.c, this.scrape); this.lastCollisions = this.c.numComputedCollisions();
    for (let i = 0; i < this.c.numComputedCollisions(); i++) { const hit = this.c.computedCollision(i); if (hit) this.v = removeInward(this.v, hit.normal1); }
    const next = { x: p.x + actual.x, y: p.y + actual.y, z: p.z + actual.z };
    this.body.setNextKinematicTranslation(next); this.world.step();
    this.p = this.body.translation(); this.yaw = runtime.yaw; this.pitch = runtime.pitch; this.t += dt;
    this.speed = Math.hypot(actual.x, actual.y, actual.z) / dt; this.chosenSpeed = Math.hypot(chosen.x, chosen.y, chosen.z);
    return this;
  }
  speed = 0; chosenSpeed = 0;
  run(m: Model, seconds: number, each?: (s: Sim, i: number) => boolean | void) {
    this.setModel(m);
    for (let i = 0; i < Math.round(seconds / DT); i++) { this.step(m); if (each && each(this, i) === true) break; }
    return this;
  }
  hspeedHeading() { return Math.atan2(-this.v.x, -this.v.z); }
  face() { return { x: -Math.sin(this.yaw) * Math.cos(this.pitch), y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * Math.cos(this.pitch) }; }
  free() { this.world.free(); }
}
/** The cue the suit shows now: Player.tsx's limitCue, through limitStep. 'edge' = wall, sky or water; 'solid' = a hill or facade. */
export function cue(s: Sim, kind: 'edge' | 'solid'): boolean { return kind === 'edge' ? ['wall', 'ceiling', 'floor'].includes(s.cueNow) : s.cueNow === 'solid'; }
export const bd = boundaryDistance;
export { START, WORLD, FOOT, thumbThrottle };
