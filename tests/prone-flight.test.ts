import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { bindAngelClips, type AngelClips } from '../src/world/angelClips';
import { PRONE, PRONE_LEGS, createAngelMotion, proneSpeed, proneTarget, stepAngelMotion, turnBody, type AngelMotionInput } from '../src/world/angelMotion';
import { cancelStrike } from '../src/game/strike';
import { SHOVE, clearShove, shoveAngel, shoveStep } from '../src/game/hurtShove';

// Plan 2026-11-16-real-fight A2: the angel flies prone at speed (along its facing, or down), upright at hover and in a climb, and
// never doubles the lean.
let asset: Awaited<ReturnType<typeof loadSuit>>, clips: AngelClips;
beforeAll(async () => { asset = await loadSuit('archangel'); clips = bindAngelClips(asset.animations); });
beforeEach(() => { cancelStrike(); clearShove(true); });
const deg = (r: number) => r * 180 / Math.PI;
const at = (name: string) => BONE_NAMES.indexOf(name as typeof BONE_NAMES[number]);
const flight = (over: Partial<AngelMotionInput> = {}): AngelMotionInput => ({ dt: 1 / 60, paused: false, flying: true, ground: 0, speed: 0, sword: true, lean: 0, ...over });
/** Steps the layer for `seconds`, re-posing the model each frame as the game does, and returns the last frame's root and chest. */
function fly(input: AngelMotionInput, seconds: number) {
  const rig = buildSuitRig(asset.scene), m = createAngelMotion();
  for (let n = 0; n < Math.round(seconds * 60); n++) {
    rig.root.quaternion.identity(); rig.root.position.set(0, 0, 0); for (const j of rig.joints) j.quaternion.identity();
    stepAngelMotion(m, clips, rig.joints, input); turnBody(rig.root, m);
  }
  rig.root.updateMatrixWorld(true);
  const head = rig.joints[at('head')].getWorldPosition(new Vector3()), chest = rig.joints[at('chest')].getWorldPosition(new Vector3());
  const feet = rig.joints[at('foot_l')].getWorldPosition(new Vector3()).distanceTo(rig.joints[at('foot_r')].getWorldPosition(new Vector3()));
  const result = { m, head, chest, feet, legs: PRONE_LEGS.map(([b]) => rig.joints[b].quaternion.clone()) };
  rig.dispose(); return result;
}

describe('prone flight', () => {
  it('asks for no pitch at or below hover speed, 65 deg at cruise and 75 deg at dive speed, rising smoothly between', () => {
    expect(proneTarget(0)).toBe(0); expect(proneTarget(PRONE.hover)).toBe(0);
    expect(deg(proneTarget(PRONE.cruise))).toBeCloseTo(65, 6); expect(deg(proneTarget(PRONE.dive))).toBeCloseTo(75, 6);
    expect(deg(proneTarget(130))).toBeCloseTo(75, 6);
    let last = 0;
    for (let v = 0; v <= 140; v += .5) { const p = proneTarget(v); expect(p).toBeGreaterThanOrEqual(last); expect(p - last).toBeLessThan(.05); last = p; }
  });
  it('measures the travel along the facing plus the descent, without the hit shove', () => {
    expect(proneSpeed({ x: 0, y: 0, z: -22 }, 0)).toBeCloseTo(22, 9); expect(proneSpeed({ x: -22, y: 0, z: 0 }, Math.PI / 2)).toBeCloseTo(22, 9);
    expect(deg(proneTarget(proneSpeed({ x: 0, y: -60, z: -4 }, 0)))).toBeCloseTo(75, 6); // a steep strike dive lies prone
    expect(proneSpeed({ x: 0, y: 0, z: 22 }, 0)).toBe(0); expect(proneSpeed({ x: 22, y: 0, z: 0 }, 0)).toBe(0); // backward, sideways
    expect(proneSpeed({ x: 0, y: 30, z: -2 }, 0)).toBeLessThan(PRONE.hover); // a climb
    shoveAngel(0, -.3, -1); const v = { x: 0, y: 0, z: 0 }; shoveStep(v, 1 / 60, true); // shoved forward and down at hover
    expect(Math.hypot(v.y, v.z)).toBeCloseTo(SHOVE.speed, 6); expect(proneSpeed(v, 0)).toBeCloseTo(0, 9);
  });
  it('keeps the body upright at hover speed and in a straight climb', () => {
    for (const travel of [0, 1.5, PRONE.hover]) {
      const r = fly(flight({ travel }), 1); expect(r.m.pitch).toBe(0); expect(r.m.prone).toBe(0);
      // The head over the chest: archangel.glb's idle mocap carries it 5.6 cm forward (-Z) at hover; prone at cruise it is 29 cm.
      expect(Math.abs(r.head.z - r.chest.z)).toBeLessThan(.08);
    }
  });
  it('lays the body prone at cruise during a fight (no lean), eased over about .3 s, about the chest', () => {
    const first = fly(flight({ travel: PRONE.cruise }), 1 / 60);
    expect(-first.m.pitch).toBeLessThan(PRONE.atCruise * .1); // eased, not snapped
    const settled = fly(flight({ travel: PRONE.cruise }), 1.5);
    expect(deg(-settled.m.pitch)).toBeCloseTo(65, 0);
    const lean = Math.atan2(settled.chest.z - settled.head.z, settled.head.y - settled.chest.y); // forward of vertical, chest to head
    expect(deg(lean)).toBeGreaterThan(55); // the head well forward (-Z) of the chest
    expect(settled.chest.length()).toBeLessThan(.5); // pivoted about the chest bone: it stays near the rest chest (0, .4, 0)
    expect(settled.chest.distanceTo(new Vector3(0, .4, -.06))).toBeLessThan(.1);
    const dive = fly(flight({ travel: 90 }), 2.5); expect(deg(-dive.m.pitch)).toBeCloseTo(75, 0);
  });
  it('only makes up what the flight lean leaves short, so the pitch is never doubled', () => {
    expect(fly(flight({ travel: PRONE.cruise, lean: -1.35 }), 1.5).m.pitch).toBe(0); // the full-power lean is already prone
    const partial = fly(flight({ travel: PRONE.cruise, lean: -.5 }), 1.5);
    expect(-partial.m.pitch).toBeCloseTo(proneTarget(PRONE.cruise) - .5, 1);
  });
  it('brings the legs together, straight and pointed while prone', () => {
    const hover = fly(flight({ travel: 0 }), 1), prone = fly(flight({ travel: PRONE.cruise }), 1.5);
    expect(prone.feet).toBeLessThan(.3); expect(prone.feet).toBeLessThanOrEqual(hover.feet + 1e-6);
    for (const [k, q] of prone.legs.entries()) expect(q.angleTo(hover.legs[k])).toBeGreaterThan(.01);
  });
  it('stays upright under reduced motion and on the ground', () => {
    expect(fly(flight({ travel: 60, reduced: true }), 1).m.pitch).toBe(0);
    expect(fly(flight({ travel: 6, flying: false, ground: 1 }), 1).m.pitch).toBe(0);
  });
  it('is wired in Suit.tsx: the root\'s whole pitch and the travel go in, and the wings counter the whole pitch', () => {
    const suit = readFileSync('src/world/Suit.tsx', 'utf8');
    expect(suit).toContain('lean: pose.lean + pose.pitch * pose.power, travel: proneSpeed(v, pose.yaw), epoch: pose.epoch });');
    expect(readFileSync('src/world/suitPose.ts', 'utf8')).toContain('euler.set(pose.lean + pose.pitch * power,'); // the root pitch it tops up
    expect(suit).toContain('alignArchangelWings(wings, rig.root, pose.lean + moves.current.pitch);');
    expect(suit.indexOf('stepAngelMotion(moves.current, clips, rig.joints, moveInput); turnBody(rig.root, moves.current);'))
      .toBeLessThan(suit.indexOf('stepStrikeStance(stance.current')); // the prone legs go in before the strike stance and the springs
  });
});
