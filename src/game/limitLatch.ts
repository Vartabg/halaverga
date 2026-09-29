import { WORLD, type Vec } from './motion';
// Shared numbers and state of the limit steering (limits plan S1, S5b, S6): limitSteer.ts (yaw at walls and faces, and the pilot's
// turn winning) and limitPeel.ts (pitch at the ceiling, water and roofs). One latch record, reset when flight stops.
// yaw 2 rad/s (2.6 at surge; the pilot's own edge hold stays 1.5), faces 2.2, pitch 2.2. A pinned suit waits `delay` (0.36 s) before it
// turns, so a pilot about to turn is never fought.
export const STEER = { yaw: 2, zone: 6, zoneSpeed: .75, delay: .36, ramp: .15, fast: .6, outWall: .6, startWall: .3, faceMaxS: 3, outFace: .75, face: 2.2,
  stallSpeed: .4, into: .1, pressS: .2, minIn: 1, ttc: 4, hug: 2.5, yieldYaw: .5, yieldPitch: .4, hold: .2, gap: .15, faceLostS: .8, wedgeS: .6, wedgeMaxS: 2.5, wedgeFree: 2,
  pitch: 2.2, peelTarget: .8, peelInto: .35, peelZone: 4, touch: .8, touchInto: .03, touchS: .25, settleClear: 8, settleRise: 20, settle: 1 } as const;
export interface Contact { active: boolean; normal: Vec }
export interface SteerIn {
  dt: number; p: Vec; v: Vec; /** actual speed last step (m/s moved), not the velocity asked for */ speed: number;
  /** Speed the controls ask for (0 with no intent). */ commanded: number;
  /** The velocity the controls ask for (motion.flightTarget): the direction the pilot is trying to go, whatever way the nose points. */ target: Vec;
  contact: Contact;
  /** The solid the character controller pressed on last step (scrape.ts): present every step of a slide, unlike `contact`. */ scrape: Contact;
  /** False in twin-touch level flight, where the view pitch is aim only: the pitch nudge stays out of it. */ pitchFlies: boolean;
  /** The blaster trigger or ADS is held: the view is the pilot's aim, so the nudge waits. */ aiming: boolean;
  /** How far (m, up to 20) the suit's own capsule runs along a horizontal direction before it touches something: asked to break a tie at a face and by the wedge fallback. */
  free?: (x: number, z: number) => number;
}
const fresh = () => ({ live: false, wall: false, wallSide: 0, wallT: 0, face: false, faceSide: 0, faceT: 0, fx: 0, fy: 0, fz: 0, fp: 0, fpGap: 9, faceGap: 0, stuckT: 0, stuckGap: 9, wedge: false, wedgeT: 0, wedgeYaw: 0, peel: 0, touchT: 0, touchGap: 9,
  shallow: false, leave: 0, leaveT: 0, peelLost: 0, settle: false, y0: 0, holdYaw: 0, holdPitch: 0, lastTurn: 0, yaw: NaN, pitch: NaN });
export const S = fresh();
/** Which way the pitch peel is leaving (+1 the ceiling, -1 the floor or a roof), 0 when it is not. */
export const peeling = () => S.peel || (S.leaveT > 0 ? S.leave : 0);
/** Drops every latch: a new flight, a landing, a reset. */
export const resetLimitSteer = () => { Object.assign(S, fresh()); };
/** Player calls this on every step the steering does not run (landed, landing, hovering aimed): resets once, then costs nothing. */
export const idleLimitSteer = () => { if (S.live) resetLimitSteer(); };
export const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/** Inward normals (into open air) of the four walls, in wallGap order. */
export const WALLS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const wallGap = (p: Vec) => [p.x - WORLD.minX, WORLD.maxX - p.x, p.z - WORLD.minZ, WORLD.maxZ - p.z];
