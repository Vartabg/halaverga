import { Vector3 } from 'three';
import { landingVelocity, type Vec } from '../src/game/motion';
import { advanceFlightPose } from '../src/game/presentation';
import { advanceSuitAnimation, createSuitAnimation, type SuitAnimation } from '../src/world/suitAnimation';
import { advanceSuitMotion } from '../src/world/suitPose';
import { BONE_COUNT } from '../src/world/suitSkeleton';
import { advanceFlightMix, createFlightMix, flightPose, frame, rig, type Rig } from './flight-harness';
import type { FlightMix } from '../src/world/flightMix';
/** What the player and physics hand the presentation each frame. */
export type Step = { velocity: Vec; flying: boolean; landing?: boolean; yaw?: number; pitch?: number; hero?: boolean };
export type Shot = { i: number; t: number; clips: Rig; legacy: Rig; p: ReturnType<typeof flightPose>; mix: FlightMix; life: SuitAnimation };
/**
 * Runs the game's per-frame order at `hz` (presentation, animation, mix, then one Suit.tsx frame) and poses a clips rig and a
 * clips-off rig from the same state. `drive` gets the time at the start of the step and the step length.
 */
export function play(seconds: number, hz: number, drive: (t: number, dt: number) => Step, each: (s: Shot) => void,
  { reduced = false, hero = 1, speed = 0 }: { reduced?: boolean; hero?: number; speed?: number } = {}) {
  const dt = 1 / hz, p = flightPose({ speed, viewPitch: -.12, pitch: -.12 }), life = createSuitAnimation(), mix = createFlightMix();
  const clips = rig(), legacy = rig(), motion = { hero, epoch: 0 };
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    const s = drive((i - 1) * dt, dt), v = s.velocity, yaw = s.yaw ?? 0, pitch = s.pitch ?? -.12;
    advanceFlightPose(p, { yaw, pitch, speed: Math.hypot(v.x, v.y, v.z), velocity: v, flying: s.flying, reduced }, dt);
    if (s.hero !== undefined) advanceSuitMotion(motion, s.hero, dt);
    advanceSuitAnimation(life, p, { flying: s.flying, landing: s.landing, velocity: v }, dt);
    advanceFlightMix(mix, p, { paused: false, reduced, flying: s.flying, landing: s.landing, velocity: v }, dt);
    frame(clips, p, mix, life, motion.hero, reduced); frame(legacy, p, mix, life, motion.hero, reduced, false);
    each({ i, t: i * dt, clips, legacy, p, mix, life });
  }
}
/** An assisted landing as Player.tsx flies it: hover, then landingVelocity to the goal, touching down within 6 cm. */
export function landing(from: Vec, goal: Vec, after = 1) {
  const at = { ...from }; let flying = true, approach = false;
  return (t: number, dt: number): Step => {
    if (flying && t >= after) approach = true;
    let velocity = approach ? landingVelocity(at, goal) : { x: 0, y: 0, z: 0 };
    at.x += velocity.x * dt; at.y += velocity.y * dt; at.z += velocity.z * dt;
    if (approach && Math.hypot(goal.x - at.x, goal.y - at.y, goal.z - at.z) < .06) { approach = false; flying = false; velocity = { x: 0, y: 0, z: 0 }; }
    return { velocity, flying, landing: approach };
  };
}
const q = (r: Rig) => r.joints.map(j => j.quaternion.clone().normalize());
/** Per-joint rotation (rad) between two snapshots. */
export const turned = (a: ReturnType<typeof q>, b: ReturnType<typeof q>) => a.map((x, k) => x.angleTo(b[k]));
export const snapshot = q;
/** A point on a joint (its head by default) in the root frame, in metres. */
export const local = (r: Rig, bone: number, offset = new Vector3()) => r.root.worldToLocal(r.joints[bone].localToWorld(offset.clone()));
/** The toe tip in the toe bone's frame. */
export const TOE_TIP = new Vector3(0, -.029, -.065);
export { BONE_COUNT };
