import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { bindAngelClips, blendAngelClip, FULL, type AngelClips } from '../src/world/angelClips';
import { createAngelMotion, SLASH, stepAngelMotion, type AngelMotionInput } from '../src/world/angelMotion';
import { banish, FX } from '../src/game/banishState';
import { beginStrike, cancelStrike, landStrike, strike } from '../src/game/strike';

let asset: Awaited<ReturnType<typeof loadSuit>>, clips: AngelClips;
beforeAll(async () => { asset = await loadSuit('angel'); clips = bindAngelClips(asset.animations); });
beforeEach(() => cancelStrike());
const bone = (name: string) => BONE_NAMES.indexOf(name as typeof BONE_NAMES[number]);
function posed(clip?: string, time = 0) {
  const rig = buildSuitRig(asset.scene);
  if (clip) blendAngelClip(rig.joints, clips[clip], time, 1, FULL);
  rig.root.updateMatrixWorld(true);
  return { rig, at: (name: string) => rig.joints[bone(name)].getWorldPosition(new Vector3()) };
}
function emit(kind: number) {
  const e = banish.fx[++banish.fxSerial % banish.fx.length]; e.serial = banish.fxSerial; e.kind = kind; e.t = banish.clock;
}
const flight = (over: Partial<AngelMotionInput> = {}): AngelMotionInput => ({ dt: 1 / 60, paused: false, flying: true, ground: 0, speed: 30, sword: true, ...over });

describe('the library clips on the angel', () => {
  it('carries the five game clips with a rotation track for every game bone and the pelvis shift', () => {
    for (const name of ['idle', 'swordIdle', 'slash', 'rebuke', 'cast']) {
      const c = clips[name]; expect(c, name).toBeDefined();
      expect(c.rotations.every(Boolean)).toBe(true); expect(c.pelvis).not.toBeNull(); expect(c.duration).toBeGreaterThan(.3);
    }
  });
  it('retargets onto the rest stance: the idle keeps both hands near their rest place and below the hips', () => {
    const rest = posed(), idle = posed('idle', 0);
    for (const hand of ['hand_l', 'hand_r']) {
      expect(idle.at(hand).distanceTo(rest.at(hand))).toBeLessThan(.25);
      expect(idle.at(hand).y).toBeLessThan(rest.at('pelvis').y + .1);
    }
    rest.rig.dispose(); idle.rig.dispose();
  });
  it('raises the sword hand above the head at the top of the cut and brings it below the chest after it', () => {
    const top = posed('slash', SLASH.raised), after = posed('slash', .6);
    expect(top.at('hand_r').y).toBeGreaterThan(top.at('head').y);
    expect(after.at('hand_r').y).toBeLessThan(after.at('chest').y);
    top.rig.dispose(); after.rig.dispose();
  });
});

describe('the angel motion layer', () => {
  it('holds the raised sword through the dive and cuts on contact', () => {
    const { rig } = posed(), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight());
    beginStrike(0, { x: 0, y: 0, z: -40 }, 40);
    for (let i = 0; i < 40; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe('slash'); expect(m.actT).toBeCloseTo(SLASH.raised, 6); expect(m.weight).toBe(1);
    landStrike(true); emit(FX.sword);
    stepAngelMotion(m, clips, rig.joints, flight()); expect(m.actT).toBeGreaterThan(SLASH.raised);
    for (let i = 0; i < 120; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe(''); expect(m.weight).toBe(0); rig.dispose();
  });
  it('leaves the legs and pelvis to the flight pose while a move plays in the air', () => {
    const { rig } = posed(), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight());
    const legs = ['pelvis', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'].map(n => rig.joints[bone(n)].quaternion.clone());
    emit(FX.cast);
    for (let i = 0; i < 20; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe('cast');
    ['pelvis', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'].forEach((n, i) => expect(rig.joints[bone(n)].quaternion.angleTo(legs[i])).toBe(0));
    expect(rig.joints[bone('upperarm_r')].quaternion.angleTo(new Quaternion())).toBeGreaterThan(.1); rig.dispose();
  });
  it('idles only while standing still on the ground, and ignores effects from before it mounted', () => {
    emit(FX.rebuke);
    const { rig } = posed(), m = createAngelMotion(), ground = flight({ flying: false, ground: 1, speed: 0 });
    for (let i = 0; i < 60; i++) stepAngelMotion(m, clips, rig.joints, ground);
    expect(m.act).toBe(''); expect(m.idle).toBeGreaterThan(.95);
    for (let i = 0; i < 60; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.idle).toBeLessThan(.01); rig.dispose();
  });
  it('freezes with the game: a paused frame advances nothing', () => {
    const { rig } = posed(), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight()); emit(FX.rebuke); stepAngelMotion(m, clips, rig.joints, flight());
    const t = m.actT; for (let i = 0; i < 10; i++) stepAngelMotion(m, clips, rig.joints, flight({ paused: true }));
    expect(m.actT).toBe(t); expect(strike.phase).toBe(0); rig.dispose();
  });
});
