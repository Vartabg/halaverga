// Shared shooter state (phase 1). runtime.ts imports it on the landing page: plain {x,y,z}, typed arrays and numbers only,
// no three/React Three/Rapier imports and no check-first-load marker strings. Nothing here allocates after createShooter().
export type Vec3 = { x: number; y: number; z: number };
/** The device that is steering the view: selects the aim-assist profile and the recoil scale. */
export type LookSource = 'touch' | 'tap' | 'trackpad' | 'mouse';
/** Who is holding the trigger. A release only clears the hold it owns. */
export type FireSource = 'none' | 'touch' | 'tap' | 'keys' | 'click';
export type EventKind = 'miss' | 'world' | 'water' | 'hit' | 'weak' | 'kill' | 'blocked'
  | 'overheat' | 'vent' | 'telegraph' | 'arrive' | 'break' | 'burst';
export type ShotEvent = { serial: number; kind: EventKind; t: number; from: Vec3; point: Vec3; normal: Vec3; drone: number };
export const PHASE = { patrol: 0, alert: 1, telegraph: 2, dodge: 3, punish: 4, dying: 5, dead: 6, arriving: 7 } as const;

export const MAX_DRONES = 8, EVENT_RING = 16, WATER_LEVEL = .1, SHOT_RANGE = 250;
/** Rapier interaction groups (memberships << 16 | filter). The boundary joins group 1 only; shots are group 2 and see group 0 only. */
export const BOUNDARY_GROUPS = 0x0002ffff, SHOT_GROUPS = 0x00040001;
/** Rapier QueryFilterFlags.ONLY_FIXED (verified in rapier3d-compat 0.19.2): excludes the kinematic player capsule. */
export const ONLY_FIXED = 6;
export const DRONE_RADIUS = .9, EYE_RADIUS = .32, EYE_FORWARD = .72, DRONE_HP = 6;
export const HEAT = { max: 100, lock: 1.6, ventAt: .8, ventHalf: .11 } as const;
/** Seconds after the last shot that still count as hip fire (speed cap) and as engaged (assist, perception). */
export const HIP_HOLD = .3, ENGAGED_HOLD = 1;
/** Exponential blends snap to their target inside this distance, so idle state returns to exactly 0 (bit-identical to main). */
export const SNAP = 1e-4;
/** tan(25 deg) / tan(32.5 deg): ADS look gain that keeps the crosshair's screen speed constant from 65 to 50 deg vFOV. */
export const ADS_GAIN = Math.tan(25 * Math.PI / 180) / Math.tan(32.5 * Math.PI / 180);
/** Aim-assist scale per steering device. Friction is read at look() time, so switching device takes effect at once. */
export const ASSIST_PROFILE: Record<LookSource, { friction: number; magnet: number }> = { touch: { friction: 1, magnet: 1 },
  tap: { friction: 0, magnet: 1.5 }, trackpad: { friction: .6, magnet: .75 }, mouse: { friction: 0, magnet: .5 } }, MAX_SLOW = .85;

export type ShooterInput = {
  fire: boolean; fireSource: FireSource; aim: boolean; aimLatched: boolean;
  /** Bumped on every fire press (never reset), so a press and release inside one frame still fires once. */
  pressSerial: number; touchId: number | null; lookSource: LookSource; tapFireUntil: number;
};
export type WeaponState = {
  acc: number; heat: number; spreadHeat: number; lock: number; lockT: number; sinceShot: number;
  handledPress: number; pending: boolean; moveMul: number; shots: number; justOverheated: boolean; justVented: boolean;
};
export type AimState = {
  /** Published by CameraRig each frame: the unshaken camera ray (kick included), its right/up axes and the rendered vertical FOV (deg). */
  origin: Vec3; dir: Vec3; right: Vec3; up: Vec3; valid: boolean; fov: number;
  /** Last resolved crosshair point and distance, for the suit IK and the HUD. */
  point: Vec3; dist: number; blocked: boolean;
  /** ADS blend 0..1, hip-fire arm hold 0..1, current spread half-angle (rad). */
  blend: number; fireHold: number; spreadHalf: number;
  combat: boolean; acquired: boolean; target: number;
};
export type Muzzle = Vec3 & { valid: boolean; weight: number };
export type CamFx = {
  kickP: number; kickY: number; kickPv: number; kickYv: number;
  fovShot: number; fovShotV: number; fovKill: number; fovKillV: number;
  trauma: number; shakeP: number; shakeY: number;
};
/** slow is the zone strength before the device profile and the strength setting (lookGain applies both). */
export type Assist = { slow: number; driftYaw: number; driftPitch: number; engaged: boolean; scale: number };
export type DroneTarget = { c: Vec3; r: number; eye: Vec3; eyeR: number; alive: boolean; los: boolean };
/** Struct-of-arrays drone state. drones.ts is the only writer; the renderer, effects and the shooter read it. */
export type DroneField = {
  count: number; phase: Uint8Array; phaseT: Float32Array; patrol: Uint8Array; patrolT: Float32Array;
  pos: Vec3[]; home: Vec3[]; anchor: Vec3[]; from: Vec3[]; to: Vec3[];
  yaw: Float32Array; pitch: Float32Array; tiltX: Float32Array; tiltZ: Float32Array;
  hp: Int8Array; broken: Uint8Array; flash: Float32Array; tint: Float32Array; lastHit: Float32Array; flashHist: Float64Array;
  knock: Vec3[]; knockV: Vec3[]; wobble: Float32Array; wobbleV: Float32Array;
  dwell: Float32Array; cooldown: Float32Array; losT: Float32Array; los: Uint8Array; unseenT: Float32Array; side: Int8Array;
};
export type ShooterStats = { shots: number; hits: number; kills: number; chain: number; lastKillT: number };
export type ShooterState = {
  clock: number; input: ShooterInput; weapon: WeaponState; aim: AimState; muzzle: Muzzle; camFx: CamFx;
  assist: Assist; drones: DroneField; targets: DroneTarget[]; events: ShotEvent[]; eventSerial: number; stats: ShooterStats;
};

const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const list = <T>(make: () => T) => Array.from({ length: MAX_DRONES }, make);
export function createDroneField(): DroneField {
  const f = () => new Float32Array(MAX_DRONES);
  return {
    count: 0, phase: new Uint8Array(MAX_DRONES), phaseT: f(), patrol: new Uint8Array(MAX_DRONES), patrolT: f(),
    pos: list(v3), home: list(v3), anchor: list(v3), from: list(v3), to: list(v3), yaw: f(), pitch: f(), tiltX: f(), tiltZ: f(),
    hp: new Int8Array(MAX_DRONES), broken: new Uint8Array(MAX_DRONES), flash: f(), tint: f(), lastHit: f().fill(-1e9),
    flashHist: new Float64Array(MAX_DRONES * 3).fill(-Infinity),
    knock: list(v3), knockV: list(v3), wobble: f(), wobbleV: f(),
    dwell: f(), cooldown: f(), losT: f(), los: new Uint8Array(MAX_DRONES), unseenT: f(), side: new Int8Array(MAX_DRONES),
  };
}
export function createShooter(): ShooterState {
  return {
    clock: 0,
    input: { fire: false, fireSource: 'none', aim: false, aimLatched: false, pressSerial: 0, touchId: null, lookSource: 'trackpad', tapFireUntil: 0 },
    weapon: { acc: 0, heat: 0, spreadHeat: 0, lock: 0, lockT: 0, sinceShot: Infinity, handledPress: 0, pending: false, moveMul: 1, shots: 0, justOverheated: false, justVented: false },
    aim: { origin: v3(), dir: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, valid: false, fov: 65,
      point: v3(), dist: SHOT_RANGE, blocked: false, blend: 0, fireHold: 0, spreadHalf: 0, combat: false, acquired: false, target: -1 },
    muzzle: { x: 0, y: 0, z: 0, valid: false, weight: 0 },
    camFx: { kickP: 0, kickY: 0, kickPv: 0, kickYv: 0, fovShot: 0, fovShotV: 0, fovKill: 0, fovKillV: 0, trauma: 0, shakeP: 0, shakeY: 0 },
    assist: { slow: 0, driftYaw: 0, driftPitch: 0, engaged: false, scale: 1 },
    drones: createDroneField(),
    targets: list(() => ({ c: v3(), r: DRONE_RADIUS, eye: v3(), eyeR: EYE_RADIUS, alive: false, los: false })),
    events: Array.from({ length: EVENT_RING }, () => ({ serial: 0, kind: 'miss' as EventKind, t: 0, from: v3(), point: v3(), normal: { x: 0, y: 1, z: 0 }, drone: -1 })),
    eventSerial: 0,
    stats: { shots: 0, hits: 0, kills: 0, chain: 0, lastKillT: -Infinity },
  };
}
/** Drops every held control (pause, blur, resize, lock loss, reset, context loss). Serials and stats are kept. */
export function resetShooterInput(s: ShooterState) {
  const i = s.input; i.fire = false; i.fireSource = 'none'; i.aim = false; i.aimLatched = false; i.touchId = null; i.tapFireUntil = 0;
}
/** Returns every feel channel to exact rest (setting off, unmount, fault): afterwards look, camera and pose match main bit for bit. */
export function resetShooterFeel(s: ShooterState) {
  resetShooterInput(s);
  const a = s.aim, w = s.weapon, fx = s.camFx, as = s.assist;
  a.blend = 0; a.fireHold = 0; a.spreadHalf = 0; a.combat = false; a.acquired = false; a.target = -1; a.blocked = false;
  w.acc = 0; w.heat = 0; w.spreadHeat = 0; w.lock = 0; w.lockT = 0; w.sinceShot = Infinity; w.pending = false; w.handledPress = s.input.pressSerial;
  fx.kickP = fx.kickY = fx.kickPv = fx.kickYv = fx.fovShot = fx.fovShotV = fx.fovKill = fx.fovKillV = fx.trauma = fx.shakeP = fx.shakeY = 0;
  as.slow = 0; as.driftYaw = 0; as.driftPitch = 0; as.engaged = false;
  s.muzzle.valid = false; s.muzzle.weight = 0;
}
export function pressFire(s: ShooterState, source: Exclude<FireSource, 'none'>) { s.input.fire = true; s.input.fireSource = source; s.input.pressSerial++; }
/** Releases the trigger only if `source` owns it (a key-up must not stop a held touch Fire). */
export function releaseFire(s: ShooterState, source: Exclude<FireSource, 'none'>) {
  if (s.input.fireSource !== source) return;
  s.input.fire = false; s.input.fireSource = 'none';
}
/** One shot without a hold (keyboard or switch activation of a button): the weapon consumes the serial. */
export function tapShot(s: ShooterState) { s.input.pressSerial++; }
export function pressAim(s: ShooterState, toggle: boolean) { if (toggle) s.input.aimLatched = !s.input.aimLatched; else s.input.aim = true; }
export const releaseAim = (s: ShooterState) => { s.input.aim = false; };
export const aimHeld = (s: ShooterState) => s.input.aim || s.input.aimLatched;
/** 0 = normal flight, 1 = hip fire (13 m/s cap), 2 = ADS hover-strafe. */
export function moveMode(s: ShooterState): 0 | 1 | 2 {
  return aimHeld(s) ? 2 : s.input.fire || s.weapon.sinceShot < HIP_HOLD ? 1 : 0;
}
export const engaged = (s: ShooterState) => aimHeld(s) || s.input.fire || s.weapon.sinceShot < ENGAGED_HOLD;
/** Copies into the next ring slot; consumers remember the last serial they read. */
export function pushEvent(s: ShooterState, kind: EventKind, from: Vec3, point: Vec3, normal: Vec3 | null, drone = -1) {
  const e = s.events[s.eventSerial % EVENT_RING];
  e.serial = ++s.eventSerial; e.kind = kind; e.t = s.clock; e.drone = drone;
  e.from.x = from.x; e.from.y = from.y; e.from.z = from.z; e.point.x = point.x; e.point.y = point.y; e.point.z = point.z;
  if (normal) { e.normal.x = normal.x; e.normal.y = normal.y; e.normal.z = normal.z; } else { e.normal.x = 0; e.normal.y = 1; e.normal.z = 0; }
}
/** Calls fn for each event newer than cursor.last, oldest first, skipping any the ring already overwrote. Hoist fn: no closures per frame. */
export function readEvents(s: ShooterState, cursor: { last: number }, fn: (e: ShotEvent) => void) {
  for (let n = Math.max(cursor.last + 1, s.eventSerial - EVENT_RING + 1); n <= s.eventSerial; n++) fn(s.events[(n - 1) % EVENT_RING]);
  cursor.last = s.eventSerial;
}
export const aimGain = (a: number) => 1 + (ADS_GAIN - 1) * a;
/** Effective friction (0..MAX_SLOW) for the current steering device, strength setting and engagement. */
export function frictionNow(s: ShooterState) {
  if (!s.assist.engaged || s.assist.slow === 0) return 0;
  return Math.min(MAX_SLOW, s.assist.slow * ASSIST_PROFILE[s.input.lookSource].friction * s.assist.scale);
}
/**
 * Scales one look() delta by the ADS gain and the aim-assist friction. Dynamic boost: an axis whose input moves the view
 * the same way the target drifts is not slowed. Returns the input unchanged (bit-exact) while the shooter is idle.
 */
export function lookGain(s: ShooterState, dx: number, dy: number, out: { x: number; y: number }) {
  const a = s.aim.blend, slow = frictionNow(s);
  if (a === 0 && slow === 0) { out.x = dx; out.y = dy; return out; }
  const g = aimGain(a);
  out.x = dx * g * (-dx * s.assist.driftYaw > 0 ? 1 : 1 - slow);
  out.y = dy * g * (-dy * s.assist.driftPitch > 0 ? 1 : 1 - slow);
  return out;
}
/** WCAG 2.3.1 gate over 3 slots at hist[offset..offset+2]: false when 3 flashes already fell in the last 1 s; else records t. */
export function flashGate(hist: Float64Array, offset: number, t: number) {
  let oldest = offset;
  for (let k = offset + 1; k < offset + 3; k++) if (hist[k] < hist[oldest]) oldest = k;
  if (t - hist[oldest] < 1) return false;
  hist[oldest] = t; return true; }
/** View-forward unit vector for yaw/pitch (yaw 0 faces -Z, positive yaw turns left, positive pitch looks up). */
export function forwardOf(yaw: number, pitch: number, out: Vec3) {
  const cp = Math.cos(pitch); out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp; return out;
}
/** Eye (weakpoint) centre of drone i: EYE_FORWARD along its facing, after knockback. */
export function eyeCenter(f: DroneField, i: number, out: Vec3) {
  forwardOf(f.yaw[i], f.pitch[i], out);
  const p = f.pos[i], k = f.knock[i];
  out.x = p.x + k.x + out.x * EYE_FORWARD; out.y = p.y + k.y + out.y * EYE_FORWARD; out.z = p.z + k.z + out.z * EYE_FORWARD;
  return out;
}
export const droneAlive = (f: DroneField, i: number) => i < f.count && f.phase[i] !== PHASE.dying && f.phase[i] !== PHASE.dead;
/** Exact step of a damped spring x'' = -w^2 x - 2 z w x' (0 < z < 1): identical results at any frame rate. */
export function springStep(x: number, v: number, w: number, z: number, dt: number, out: { x: number; v: number }) {
  if (!(dt > 0)) { out.x = x; out.v = v; return out; }
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
  out.x = e * (x * c + (v + z * w * x) / wd * s);
  out.v = e * (v * c - (z * w * v + w * w * x) / wd * s);
  return out;
}
/** Seeded PRNG (mulberry32). Gameplay and effects never call Math.random. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
