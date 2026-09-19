import { Group, Vector3 } from 'three';
import { settle } from '../src/game/presentation';
import { BONE_HEADS, BONE_PARENTS } from '../src/world/suitSkeleton';
import { advanceFlightMix, createFlightMix, type FlightMix } from '../src/world/flightMix';
import { applyFlightClips } from '../src/world/flightPose';
import { applySuitPose, orientSuit } from '../src/world/suitPose';
import { advanceSuitAnimation, applySuitAnimation, createSuitAnimation, type AnimatedPose, type AnimationInput, type SuitAnimation } from '../src/world/suitAnimation';
/** Shared harness for the living-motion tests: plain 21-bone rigs at the exported heads, posed the way Suit.tsx poses them. */
/**
 * Which layers run: `clips` adds the flight clip layer at full authority whenever the drive flies; `settle` instead eases the pose's
 * flight weight in and out as FlightPresentation does, and every layer sees it. posed() applies either, whatever pose the test passes.
 */
export type Mode = { clips: boolean; settle?: boolean };
export const MODES: Mode[] = [{ clips: false }, { clips: true }, { clips: true, settle: true }];
let mode: Mode = { clips: false };
/** Selects the layers for the tests that follow (call it from beforeEach: describe bodies all run before any test). */
export const useClips = (next: Mode) => { mode = next; };
type WithMix = SuitAnimation & { mix?: FlightMix; flight?: number; reduced?: boolean };
/** The layer inputs for time t; `reduced` is the reduced-motion setting the frame is advanced (and must be posed) with. */
export type Drive = (t: number) => AnimationInput & { reduced?: boolean };
/** The same drive under reduced motion. */
export const calm = (drive: Drive): Drive => t => ({ ...drive(t), reduced: true });
/** The flight mix simulate() advanced on this animation state. */
export const mixOf = (a: SuitAnimation) => (a as WithMix).mix;
/** Posed() calls in clip modes, and how many of them the clip layer had authority in. */
export const engaged = { posed: 0, authored: 0 };
export const pose = (patch: Partial<AnimatedPose> = {}): AnimatedPose => ({ viewYaw: 0, viewPitch: 0, yaw: 0, pitch: 0, lean: 0, bank: 0,
  speed: 0, flight: 0, power: 0, brake: 0, epoch: 0, position: { x: 0, y: 0, z: 0 }, ...patch });
export const walking = (x: number, z: number): Drive => () => ({ flying: false, velocity: { x, y: 0, z } });
export const hovering: Drive = () => ({ flying: true, velocity: { x: 0, y: 0, z: 0 } });
export const lift = (at = 1): Drive => t => ({ flying: t >= at, velocity: { x: 0, y: t >= at ? 6 : 0, z: 0 } });
export const approach: Drive = t => ({ flying: t < 1, landing: t < 1, velocity: { x: 0, y: t < 1 ? -1.5 : 0, z: 0 } });
export function rig() {
  const root = new Group(), joints = BONE_HEADS.map(() => new Group());
  joints.forEach((joint, i) => {
    const parent = BONE_PARENTS[i], p = BONE_HEADS[i], o = parent < 0 ? [0, 0, 0] : BONE_HEADS[parent];
    joint.position.set(p[0] - o[0], p[1] - o[1], p[2] - o[2]); (parent < 0 ? root : joints[parent]).add(joint);
  });
  return { root, joints };
}
/**
 * Steps the layer like the game: inputs are sampled at the start of each step (so every refresh rate sees a change at the same
 * instant), `before` sets the anchor for the frame being rendered, `each` observes the result.
 */
export function simulate(seconds: number, hz: number, drive: Drive, p = pose(), a = createSuitAnimation(),
  each?: (a: SuitAnimation, t: number) => void, before?: (t: number) => void) {
  // The flight mix rides on the animation object, so the spread copies the tests pose share it.
  const m = a as WithMix; m.mix ??= createFlightMix();
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    before?.(i / hz); const d = drive((i - 1) / hz);
    if (mode.settle) p.flight = settle(p.flight, d.flying ? 1 : 0, 5, 1 / hz);
    advanceSuitAnimation(a, p, d, 1 / hz);
    m.flight = mode.settle ? p.flight : d.flying ? 1 : 0; m.reduced = !!d.reduced;
    advanceFlightMix(m.mix, mode.settle ? p : { ...p, flight: m.flight }, { paused: !!d.paused, reduced: m.reduced, flying: d.flying, landing: d.landing, velocity: d.velocity }, 1 / hz); each?.(a, i / hz);
  }
  return a;
}
/** Poses a rig the way Suit.tsx does (orientation, pose targets, then the layer) and measures the soles in world space. */
export function posed(a: SuitAnimation, given = pose(), { reduced = (a as WithMix).reduced ?? false, hero = 1, r = rig() } = {}) {
  const m = a as WithMix, clips = mode.clips && !!m.mix, flown = clips && m.flight !== undefined ? { ...given, flight: m.flight } : given;
  const p = mode.settle ? flown : given;
  if (clips && reduced !== (m.reduced ?? false)) throw new Error('pose with the reduced-motion setting the layer was advanced with');
  r.root.position.set(p.position.x, p.position.y, p.position.z); orientSuit(r.root, p, { hero, epoch: 0 });
  applySuitPose(r.joints, p, { hero, epoch: 0 }, reduced);
  const authored = clips ? applyFlightClips(r.joints, m.mix!, flown, a, hero, reduced) : 0;
  if (clips) { engaged.posed++; if (authored > 0) engaged.authored++; }
  const up = applySuitAnimation(r.joints, a, p, reduced, hero, authored);
  r.root.position.y += up; r.root.updateMatrixWorld(true);
  return { joints: r.joints, lift: up, authored, soles: [8, 9].map(i => r.joints[i].localToWorld(new Vector3(0, -.49, 0))) };
}
export const rotations = (joints: Group[]) => joints.flatMap(j => [j.rotation.x, j.rotation.y, j.rotation.z]);
/** The same state with the follow-through springs at rest, to isolate their contribution. */
export const quiet = (a: SuitAnimation): SuitAnimation => ({ ...a, lagForward: { x: 0, v: 0 }, lagSide: { x: 0, v: 0 } });
