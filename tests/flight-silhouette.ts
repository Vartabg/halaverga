import { Euler, Matrix4, Vector3 } from 'three';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { CHASE_BOOM, type Pose } from '../src/game/presentation';
import { BONE_HEADS } from '../src/world/suitSkeleton';
import { HOVER_LOOP } from '../src/world/flightClips';
import { idx, type Rig } from './flight-harness';
import { landing, local, play, TOE_TIP, type Shot, type Step } from './flight-sim';
/**
 * Silhouette metric: how far the clip layer moves each hand tip and toe tip on screen, as the chase camera sees it. Both rigs are
 * projected along the camera rays onto the plane through the chest at the chest's depth, so the result is metres at the explorer's
 * depth, perpendicular to the sight line (at the game's field of view it converts to pixels without changing the ranking).
 */
const HAND = [idx.handR, 15] as const, TOE = [idx.toeR, idx.toeL] as const;
/** Fingertip: 18 cm past the wrist along the rest forearm, in the hand's own frame (the rest pose is identity). */
const fingertip = (hand: number, fore: number) => new Vector3(...BONE_HEADS[hand]).sub(new Vector3(...BONE_HEADS[fore])).setLength(.18);
export const HAND_TIPS = [fingertip(idx.handR, idx.forearmR), fingertip(15, 6)] as const;
const view = new Euler(0, 0, 0, 'YXZ');
/** The chase camera's position and forward axis: boom in the view frame from the head, looking along the view. */
export function chase(p: Pose, anchor: Vec = { x: 0, y: 0, z: 0 }) {
  view.set(p.viewPitch, p.viewYaw, 0);
  const at = new Vector3(CHASE_BOOM.x, CHASE_BOOM.y, CHASE_BOOM.z).applyEuler(view).add(new Vector3(anchor.x, anchor.y + .65, anchor.z));
  return { at, forward: new Vector3(0, 0, -1).applyEuler(view), fov: 65 + Math.min(p.speed / 17, 2) };
}
/** World points of the four tips: right hand, left hand, right toe, left toe. */
export const tips = (r: Rig) => [...HAND.map((b, k) => r.joints[b].localToWorld(HAND_TIPS[k].clone())), ...TOE.map(b => r.joints[b].localToWorld(TOE_TIP.clone()))];
/** Per-tip image-plane displacement (m at the chest's depth) between the clips rig and the clips-off rig. */
export function displacement(s: Shot) {
  const cam = chase(s.p), chest = s.clips.joints[idx.chest].getWorldPosition(new Vector3());
  const depth = chest.clone().sub(cam.at).dot(cam.forward);
  const onPlane = (v: Vector3) => { const d = v.clone().sub(cam.at); return d.multiplyScalar(depth / d.dot(cam.forward)); };
  const on = tips(s.clips), off = tips(s.legacy);
  return on.map((v, k) => onPlane(v).distanceTo(onPlane(off[k])));
}
/** Where the chase camera saw a state: the clips rig's root transform, the pose (for the camera) and the chest. */
type View = { root: Matrix4; p: Pose; chest: Vector3 };
const viewOf = (s: Shot): View => ({ root: s.clips.root.matrixWorld.clone(), p: { ...s.p }, chest: s.clips.joints[idx.chest].getWorldPosition(new Vector3()) });
/** A root-frame point as the chase camera of `v` sees it, on the plane through the chest (m at the chest's depth). */
function seen(v: View, point: Vector3) {
  const cam = chase(v.p), depth = v.chest.clone().sub(cam.at).dot(cam.forward), d = point.clone().applyMatrix4(v.root).sub(cam.at);
  return d.multiplyScalar(depth / d.dot(cam.forward));
}
/** Pixels on a 1000 px tall frame for `metres` at the chest depth under the chase field of view. */
export const pixels = (metres: number, s: Shot) => {
  const cam = chase(s.p), depth = s.clips.joints[idx.chest].getWorldPosition(new Vector3()).sub(cam.at).dot(cam.forward);
  return metres / (2 * depth * Math.tan(cam.fov * Math.PI / 360)) * 1000;
};
type Drive = (t: number, dt: number) => Step;
export type State = { name: string; drive: () => Drive; warm: number; span: number; hero?: number; pick?: 'brake' | 'flare' };
/** Keyboard flight through the game's velocity model: optional surge, view turn (rad/s, left positive) and pitch. */
function keys({ surge = false, turn = 0, pitch = 0, release = Infinity }: { surge?: boolean; turn?: number; pitch?: number; release?: number }): Drive {
  let v: Vec = { x: 0, y: 0, z: 0 }, yaw = 0;
  return (t, dt) => {
    yaw += turn * dt;
    v = advanceVelocity(v, { forward: t < release ? 1 : 0, strafe: 0, vertical: 0 }, yaw, pitch, true, surge, dt);
    return { velocity: v, flying: true, yaw, pitch };
  };
}
const steady = (speed: number): Drive => () => ({ velocity: { x: 0, y: 0, z: -speed }, flying: true, yaw: 0, pitch: 0 });
export const STATES: State[] = [
  { name: 'hover', drive: () => steady(0), warm: 3, span: HOVER_LOOP },
  { name: 'cruise 8', drive: () => steady(8), warm: 3, span: 4 },
  { name: 'cruise 13', drive: () => keys({}), warm: 3, span: 4 },
  { name: 'power hero 34', drive: () => keys({ surge: true }), warm: 4, span: 4, hero: 1 },
  { name: 'power classic 34', drive: () => keys({ surge: true }), warm: 4, span: 4, hero: 0 },
  { name: 'left turn 13', drive: () => keys({ turn: 1.5 }), warm: 3, span: 4 },
  { name: 'right turn 13', drive: () => keys({ turn: -1.5 }), warm: 3, span: 4 },
  { name: 'left turn 34', drive: () => keys({ surge: true, turn: 1.5 }), warm: 4, span: 4 },
  { name: 'right turn 34', drive: () => keys({ surge: true, turn: -1.5 }), warm: 4, span: 4 },
  { name: 'brake from 34', drive: () => keys({ surge: true, release: 4 }), warm: 4, span: 1.5, pick: 'brake' },
  { name: 'dive 13', drive: () => keys({ pitch: -.9 }), warm: 3, span: 4 },
  { name: 'climb 13', drive: () => keys({ pitch: .9 }), warm: 3, span: 4 },
  { name: 'landing flare', drive: () => landing({ x: 0, y: 25, z: 0 }, { x: 0, y: 21.06, z: -8 }), warm: 0, span: 9, pick: 'flare' },
];
/** `body` is each tip in the root frame (the mean over the span, or at the picked frame): the clip-on pose, apart from the camera. */
export type Result = { name: string; tips: number[]; hands: number; feet: number; px: number; body: Vector3[]; view: View };
/**
 * Runs a state at 60 Hz and averages each tip's displacement over the span after the warm-up (a whole hover tread, or four seconds,
 * at least three loops of every shared clip). The brake and the flare are transients: they take the frame of the peak weight
 * (the mean per-bone brake weight; the last flying frame of the approach).
 */
export function silhouette(s: State, reduced = false): Result {
  const sum = [0, 0, 0, 0], body = [0, 1, 2, 3].map(() => new Vector3()); let n = 0, best = -1, peak: number[] = [], px = 0, at: Vector3[] = [];
  let view: View | null = null;
  play(s.warm + s.span, 60, s.drive(), shot => {
    if (shot.t <= s.warm + 1e-9) return;
    if (s.pick === 'brake') {
      const w = shot.mix.brake.reduce((a, b) => a + b, 0) / shot.mix.brake.length;
      if (w > best) { best = w; peak = displacement(shot); px = pixels(1, shot); at = rootTips(shot.clips); view = viewOf(shot); }
    } else if (s.pick === 'flare') {
      if (shot.life.flying && shot.mix.flare > .5) { peak = displacement(shot); px = pixels(1, shot); at = rootTips(shot.clips); view = viewOf(shot); }
    } else {
      displacement(shot).forEach((d, k) => { sum[k] += d; }); n++; px = pixels(1, shot); view = viewOf(shot);
      rootTips(shot.clips).forEach((v, k) => body[k].add(v));
    }
  }, { reduced, hero: s.hero ?? 1, speed: 0 });
  const tipsOut = s.pick ? peak : sum.map(d => d / n);
  return { name: s.name, tips: tipsOut, hands: Math.max(tipsOut[0], tipsOut[1]), feet: Math.max(tipsOut[2], tipsOut[3]), px,
    body: s.pick ? at : body.map(v => v.divideScalar(n)), view: view! };
}
const rootTips = (r: Rig) => tips(r).map(v => r.root.worldToLocal(v));
/**
 * Distinctness: per tip, the image-plane distance (m at the chest's depth) between two states' clip-on poses, each pose seen under
 * both states' root and chase camera and the two distances averaged, so it measures the pose and not the change of camera or lean.
 */
export const apart = (a: Result, b: Result) => a.body.map((_, k) => [a.view, b.view].reduce((sum, v) => sum + seen(v, a.body[k]).distanceTo(seen(v, b.body[k])), 0) / 2);
export { local };
const seg = (p: Vector3, a: Vector3, b: Vector3) => {
  const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
};
const head = (r: Rig, b: number) => r.joints[b].getWorldPosition(new Vector3());
const KNEE = [8, 9] as const, HIP = [4, 5] as const;
/**
 * Clearances in metres on the clips rig: hand tips and wrists from the torso core (pelvis to neck), from each thigh (hip to knee) and
 * from the head; the knees from each other.
 */
export function clearance(r: Rig) {
  const [hr, hl] = tips(r), hands = [hr, hl, head(r, idx.handR), head(r, 15)], pelvis = head(r, 0), neck = head(r, idx.neck);
  const crown = r.joints[idx.head].localToWorld(new Vector3(0, .12, 0)), knees = KNEE.map(b => head(r, b)), hips = HIP.map(b => head(r, b));
  return {
    torso: Math.min(...hands.map(p => seg(p, pelvis, neck))),
    thigh: Math.min(...hands.flatMap(p => hips.map((h, k) => seg(p, h, knees[k])))),
    head: Math.min(...hands.map(p => p.distanceTo(crown))),
    knees: knees[0].distanceTo(knees[1]),
  };
}
