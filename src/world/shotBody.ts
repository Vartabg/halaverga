// Whole-body shot choreography state, keyed to ONE shot clock: weapon.shots plus weapon.sinceShot, read at priority -20 right after
// the shooter step. The newest shot of a frame is sinceShot old; earlier shots in that frame are sinceShot + k / WEAPON.rate old.
// advanceShotBody only updates numbers; shotBodyPose.ts writes the joints and shotDrive.ts the cannon. No allocation per frame,
// seeded variation only (mulberry32), reduced motion fades every per-shot output out over ~150 ms.
import { SNAP, mulberry32, readEvents, springStep, type ShooterState, type ShotEvent } from '../game/combat';
import { WEAPON } from '../game/weapon';
import { restCannonDrive } from './cannonContract';
import { createFollower, resetFollower, retuneFollower, stepFollower, type Follower } from './follower';
import { CH, CHANNEL_COUNT, advanceShotSprings, createShotSprings, impulseFor, queueKick, restShotSprings, snapKick, type ShotSprings } from './shotSprings';
import { shotDirOf } from '../game/gesture/aimedShot';

export type ShotBodyEnv = { dt: number; paused: boolean; reduced: boolean; epoch: number; aimWeight: number; ads: number; ground: number; pxPerM: number };
type Spring = { x: number; v: number };
export type ShotBody = {
  springs: ShotSprings; time: number; epoch: number; lastShots: number; lock: boolean; cursor: { last: number }; rng: () => number;
  /** Brace, smoothed ground weight, motion gain (0 under reduced motion), the arm's aim weight, the ADS blend. */
  B: number; gw: number; m: number; aw: number; ads: number;
  /** This frame's snap kicks per channel, applied after the springs advance so they peak on the shot frame. */ snap: Float64Array;
  breathPhase: number; breathAmp: number; breath: number; exertion: number;
  swayP1: number; swayP2: number; swayX: number; swayY: number; killYaw: number; kill: Spring; killK: number;
  hatchF: Follower; headF: Follower; ventF: Follower; hatch: number; headLead: number; v: number; venting: boolean; ventT: number;
  flick: Spring; flickK: number; n: number; lastShotT: number; burstStart: number; yawSign: number;
  /** Times (body clock) of the most recent shots, for the core flare; the last shot's base gain; the seeded variation scale (1 = on). */
  shotT: Float64Array; shotHead: number; shotGain: number; vary: number;
  /** Model-frame visual offset (m), written by applyShotBodyPre. Never physics or camera state. */ offset: { x: number; y: number; z: number };
};
const DEG = Math.PI / 180, KILL = { w: 2 * Math.PI * 2.5, z: .7 }, FLICK = { w: 2 * Math.PI * 4, z: .6 };
const KILL_I = impulseFor(KILL.w, KILL.z), FLICK_I = impulseFor(FLICK.w, FLICK.z);
/** The brace builds only from a burst's second shot (a single tap never dips the body), at BRACE_RISE/s, holds BRACE_HOLD s after the
 * last shot and releases at BRACE_FALL/s (95% gone .65 s after the last shot). */
export const RECENT = 6, BURST_GAP = .25, BRACE_HOLD = .15, BRACE_RISE = 12, BRACE_FALL = 6;
const ARM = [CH.slide, CH.elbow, CH.shoulder, CH.clav] as const, BODY = [CH.torso, CH.offArm, CH.head, CH.hoverPitch, CH.legTrail] as const;

export function createShotBody(seed = 2113): ShotBody {
  return {
    springs: createShotSprings(), time: 0, epoch: NaN, lastShots: 0, lock: false, cursor: { last: 0 }, rng: mulberry32(seed),
    B: 0, gw: 1, m: 1, aw: 0, ads: 0, snap: new Float64Array(CHANNEL_COUNT), breathPhase: 0, breathAmp: 0, breath: 0, exertion: 0,
    swayP1: 0, swayP2: 0, swayX: 0, swayY: 0, killYaw: 0, kill: { x: 0, v: 0 }, killK: 0,
    hatchF: createFollower(8, .55, 0), headF: createFollower(3, .75, 0), ventF: createFollower(3, .75, 0), hatch: 0, headLead: 0, v: 0,
    venting: false, ventT: 0, flick: { x: 0, v: 0 }, flickK: 0, n: 0, lastShotT: -Infinity, burstStart: -Infinity, yawSign: 1,
    shotT: new Float64Array(RECENT).fill(-Infinity), shotHead: 0, shotGain: 1, vary: 1, offset: { x: 0, y: 0, z: 0 },
  };
}
function rest(b: ShotBody, ground: number, reduced: boolean) {
  restShotSprings(b.springs); b.snap.fill(0); b.B = 0; b.gw = ground; b.m = reduced ? 0 : 1;
  b.breathAmp = b.breath = b.exertion = 0; b.swayX = b.swayY = 0;
  b.killYaw = b.kill.x = b.kill.v = b.killK = 0; b.flick.x = b.flick.v = b.flickK = 0;
  resetFollower(b.hatchF, 0); resetFollower(b.headF, 0); resetFollower(b.ventF, 0); b.hatch = b.headLead = b.v = 0; b.venting = false; b.ventT = 0;
  b.n = 0; b.lastShotT = b.burstStart = -Infinity; b.shotT.fill(-Infinity); b.offset.x = b.offset.y = b.offset.z = 0;
}
/** Everything to exact rest (blaster off, unmount, fault), and the cannon drive to its rest values. */
export function resetShotBody(b: ShotBody) { rest(b, 1, false); b.epoch = NaN; restCannonDrive(); }
/** The integrate unit multiplies the aim goal and the shoulder swing weight by this during the vent pose. */
export const ventAimScale = (b: ShotBody) => 1 - .6 * b.v;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function ease(value: number, to: number, rate: number, dt: number, snap = SNAP) {
  const next = value + (to - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(next - to) < snap ? to : next;
}
/** Steps a follower toward x and lands it exactly on x once it is invisible. */
function follow(f: Follower, x: number, dt: number) {
  stepFollower(f, x, dt);
  if (Math.abs(f.y - x) < 1e-5 && Math.abs(f.yd) < 1e-4) resetFollower(f, x);
  return f.y;
}
function spring(s: Spring, w: number, z: number, dt: number) {
  if (s.x === 0 && s.v === 0) return;
  springStep(s.x, s.v, w, z, dt, s);
  if (Math.abs(s.x) < 1e-5 && Math.abs(s.v) < 1e-4) s.x = s.v = 0;
}
// readEvents callback, hoisted so the frame allocates no closure.
let evB: ShotBody, evS: ShooterState, evKick = false;
function onEvent(e: ShotEvent) {
  if (e.kind !== 'kill') return;
  const a = evS.aim, px = e.point.x - a.origin.x, py = e.point.y - a.origin.y, pz = e.point.z - a.origin.z, d = shotDirOf(evS);
  // The kill-yaw basis follows the shot ray (a Gesture Lab tap's aimed ray while its burst runs): forward d, right level with it.
  const h = Math.hypot(d.x, d.z) || 1, rx = d === a.dir ? a.right.x : -d.z / h, ry = d === a.dir ? a.right.y : 0, rz = d === a.dir ? a.right.z : d.x / h;
  const ahead = px * d.x + py * d.y + pz * d.z, right = px * rx + py * ry + pz * rz;
  // Positive head y turns left, so a kill to the right (positive `right`) gives a negative yaw.
  evB.killYaw = clamp(2 * Math.atan2(-right, ahead), -5 * DEG, 5 * DEG);
  if (evKick) evB.kill.v += KILL_I;
}
function shoot(b: ShotBody, s: ShooterState, env: ShotBodyEnv, at: number) {
  b.n = at - b.lastShotT > BURST_GAP ? 0 : b.n + 1;
  if (b.n === 0) b.burstStart = at;
  b.lastShotT = at; b.shotT[b.shotHead] = at; b.shotHead = (b.shotHead + 1) % RECENT;
  if (at - b.burstStart >= 1) b.exertion = 1;
  const base = (.65 + .35 * Math.exp(-b.n / 4)) * (1 + .08 * b.vary * (2 * b.rng() - 1)), yaw = 1 + .25 * b.vary * (2 * b.rng() - 1);
  b.shotGain = base; b.yawSign = -b.yawSign;
  if (env.reduced || b.m === 0) return;
  // ADS keeps .35 of the arm snap: at .85 the muzzle jumped 15-17 CSS px on the shot frame, about 2.5x the hip kick once scaled for the
  // closer ADS camera (visual review r4). The bold cannon (r5) also caps the ADS rise at POSE.adsRiseCap (shotBodyPose.ts).
  // land lifts a far, small hip cannon (a big FOV); the phone-landscape camera (cameraFx.shortWeight) now draws it near portrait size, so land is ~1.
  const ads = clamp(env.ads, 0, 1), land = env.pxPerM > 0 && ads < .5 ? clamp(4 / (.06 * env.pxPerM), 1, 1.6) : 1;
  const arm = base * lerp(1, .35, ads) * land, body = base * lerp(1, .8, ads), sp = b.springs;
  for (let i = 0; i < ARM.length; i++) b.snap[ARM[i]] += arm;
  b.snap[CH.shoulderYaw] += arm * yaw * b.yawSign;
  for (let i = 0; i < BODY.length; i++) queueKick(sp, BODY[i], at, body);
}
/** Advances the choreography one render frame. Call once per frame at priority -20, after the shooter step. */
export function advanceShotBody(b: ShotBody, s: ShooterState, env: ShotBodyEnv) {
  if (env.paused) return;
  const w = s.weapon, aimWeight = Number.isFinite(env.aimWeight) ? clamp(env.aimWeight, 0, 1) : 0;
  b.aw = aimWeight; b.ads = Number.isFinite(env.ads) ? clamp(env.ads, 0, 1) : 0;
  const ground = Number.isFinite(env.ground) ? clamp(env.ground, 0, 1) : 1;
  if (b.epoch !== env.epoch) {
    rest(b, ground, env.reduced); b.epoch = env.epoch; b.lastShots = w.shots; b.cursor.last = s.eventSerial; b.lock = w.lock > 0;
    return;
  }
  const dt = env.dt > 0 ? Math.min(env.dt, .05) : 0, t0 = b.time, t1 = t0 + dt;
  b.time = t1;
  b.m = ease(b.m, env.reduced ? 0 : 1, 20, dt, .05);
  if (b.m === 0) { restShotSprings(b.springs); b.snap.fill(0); b.kill.x = b.kill.v = b.flick.x = b.flick.v = 0; }
  b.gw = ease(b.gw, ground, 10, dt);
  // Shots, oldest first, at their exact times on the body clock.
  const fresh = Math.min(RECENT, Math.max(0, w.shots - b.lastShots));
  b.lastShots = w.shots;
  for (let k = fresh - 1; k >= 0; k--) shoot(b, s, env, t1 - (w.sinceShot + k / WEAPON.rate));
  advanceShotSprings(b.springs, t0, t1);
  for (let c = 0; c < CHANNEL_COUNT; c++) if (b.snap[c] !== 0) { snapKick(b.springs, c, b.snap[c]); b.snap[c] = 0; }
  // Brace: from a burst's second shot, rises over the part of the frame within BRACE_HOLD of a shot, falls over the rest.
  const rise = b.n < 1 ? 0 : fresh > 0 ? dt : clamp(BRACE_HOLD - (w.sinceShot - dt), 0, dt);
  b.B += (1 - b.B) * (1 - Math.exp(-BRACE_RISE * rise)); b.B *= Math.exp(-BRACE_FALL * (dt - rise));
  if (b.B < 1e-3) b.B = 0; else if (b.B > 1 - SNAP) b.B = 1;
  // Kill beat and the overheat vent.
  evB = b; evS = s; evKick = !env.reduced && b.m > 0;
  readEvents(s, b.cursor, onEvent);
  if (w.justOverheated) {
    retuneFollower(b.hatchF, 8, env.reduced ? .98 : .55, 0); retuneFollower(b.ventF, 3, env.reduced ? .98 : .75, 0);
    retuneFollower(b.headF, 3, .75, 0); b.venting = true; b.ventT = 0; b.exertion = 1;
  } else if (b.venting) b.ventT += dt;
  if (w.justVented || (b.lock && w.lock === 0 && !w.justOverheated)) {
    retuneFollower(b.hatchF, 12, .98, 0); retuneFollower(b.ventF, w.justVented ? 3 : 2.2, .98, 0); b.venting = false;
    if (w.justVented && evKick) b.flick.v += FLICK_I;
  }
  b.lock = w.lock > 0;
  b.hatch = follow(b.hatchF, b.venting ? 1 : 0, dt);
  b.headLead = follow(b.headF, b.venting && b.ventT >= .01 ? 1 : 0, dt);
  b.v = follow(b.ventF, b.venting && b.ventT >= .06 ? 1 : 0, dt);
  spring(b.kill, KILL.w, KILL.z, dt); spring(b.flick, FLICK.w, FLICK.z, dt);
  b.killK = b.kill.x * b.m; b.flickK = b.flick.x * b.m;
  // Breathing (accumulated phase, so a frequency change never jumps) and the idle-aim sway.
  b.breathPhase = (b.breathPhase + 2 * Math.PI * (.25 + .2 * b.exertion) * dt) % (2 * Math.PI);
  b.breathAmp = aimWeight * b.gw * (1 - .8 * b.B) * (env.reduced ? .5 : 1) * (1 + .8 * b.exertion);
  b.breath = b.breathAmp === 0 ? 0 : b.breathAmp * Math.sin(b.breathPhase);
  b.exertion = Math.max(0, b.exertion - dt / 4);
  b.swayP1 = (b.swayP1 + 2 * Math.PI * .33 * dt) % (2 * Math.PI); b.swayP2 = (b.swayP2 + 2 * Math.PI * .53 * dt) % (2 * Math.PI);
  const sway = .1 * DEG * aimWeight * (1 - b.B) * b.m;
  b.swayX = sway === 0 ? 0 : sway * Math.sin(b.swayP1); b.swayY = sway === 0 ? 0 : sway * Math.sin(b.swayP2);
}
