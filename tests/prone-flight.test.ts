import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { bindAngelClips, type AngelClips } from '../src/world/angelClips';
import { PRONE, PRONE_LEGS, createAngelMotion, proneTarget, stepAngelMotion, turnBody, type AngelMotionInput } from '../src/world/angelMotion';
import { cancelStrike } from '../src/game/strike';

// Plan 2026-11-16-real-fight A2: the angel flies prone at speed, upright at hover and in a climb, and never doubles the lean.
let asset: Awaited<ReturnType<typeof loadSuit>>, clips: AngelClips;
beforeAll(async () => { asset = await loadSuit('angel'); clips = bindAngelClips(asset.animations); });
beforeEach(() => cancelStrike());
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
  it('keeps the body upright at hover speed and in a straight climb (no horizontal speed)', () => {
    for (const speed of [0, 1.5, PRONE.hover]) {
      const r = fly(flight({ speed }), 1); expect(r.m.pitch).toBe(0); expect(r.m.prone).toBe(0);
      expect(r.head.z).toBeCloseTo(r.chest.z, 1); // the head straight over the chest
    }
  });
  it('lays the body prone at cruise during a fight (no lean), eased over about .3 s, about the chest', () => {
    const first = fly(flight({ speed: PRONE.cruise }), 1 / 60);
    expect(-first.m.pitch).toBeLessThan(PRONE.atCruise * .1); // eased, not snapped
    const settled = fly(flight({ speed: PRONE.cruise }), 1.5);
    expect(deg(-settled.m.pitch)).toBeCloseTo(65, 0);
    const lean = Math.atan2(settled.chest.z - settled.head.z, settled.head.y - settled.chest.y); // forward of vertical, chest to head
    expect(deg(lean)).toBeGreaterThan(55); // the head well forward (-Z) of the chest
    expect(settled.chest.length()).toBeLessThan(.5); // pivoted about the chest bone: it stays near the rest chest (0, .4, 0)
    expect(settled.chest.distanceTo(new Vector3(0, .4, -.06))).toBeLessThan(.1);
    const dive = fly(flight({ speed: 90 }), 2.5); expect(deg(-dive.m.pitch)).toBeCloseTo(75, 0);
  });
  it('only makes up what the flight lean leaves short, so the pitch is never doubled', () => {
    expect(fly(flight({ speed: PRONE.cruise, lean: -1.35 }), 1.5).m.pitch).toBe(0); // the full-power lean is already prone
    const partial = fly(flight({ speed: PRONE.cruise, lean: -.5 }), 1.5);
    expect(-partial.m.pitch).toBeCloseTo(proneTarget(PRONE.cruise) - .5, 1);
  });
  it('brings the legs together, straight and pointed while prone', () => {
    const hover = fly(flight({ speed: 0 }), 1), prone = fly(flight({ speed: PRONE.cruise }), 1.5);
    expect(prone.feet).toBeLessThan(.3); expect(prone.feet).toBeLessThanOrEqual(hover.feet + 1e-6);
    for (const [k, q] of prone.legs.entries()) expect(q.angleTo(hover.legs[k])).toBeGreaterThan(.01);
  });
  it('stays upright under reduced motion and on the ground', () => {
    expect(fly(flight({ speed: 60, reduced: true }), 1).m.pitch).toBe(0);
    expect(fly(flight({ speed: 6, flying: false, ground: 1 }), 1).m.pitch).toBe(0);
  });
  it('is wired in Suit.tsx: the lean goes in, and the wings counter the whole pitch', () => {
    const suit = readFileSync('src/world/Suit.tsx', 'utf8');
    expect(suit).toContain('reduced: state.reduced, lean: pose.lean });');
    expect(suit).toContain('alignArchangelWings(wings, rig.root, pose.lean + moves.current.pitch);');
    expect(suit.indexOf('stepAngelMotion(moves.current, clips, rig.joints, moveInput); turnBody(rig.root, moves.current);'))
      .toBeLessThan(suit.indexOf('stepStrikeStance(stance.current')); // the prone legs go in before the strike stance and the springs
  });
});
