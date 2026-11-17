import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { bindAngelClips, blendAngelClip, blendUnder, FULL, UPPER_BODY, type AngelClips } from '../src/world/angelClips';
import { CUT_CLIPS, cutClip } from '../src/world/cutClips';
import { actClip, createAngelMotion, cutLead, SLASH, stepAngelMotion, type AngelMotionInput } from '../src/world/angelMotion';
import { CUTS } from '../src/game/swordString';
import { banish, FX } from '../src/game/banishState';
import { beginStrike, cancelStrike, landStrike } from '../src/game/strike';

// docs/plans/2026-11-16-real-fight.md B6: the cut marks are measured by the build and pinned here by recomputing them from the GLBs
// the game loads, the same way (scripts/real_bodies/clips.py): hand_r's speed by central differences over the sampled frames.
type Asset = Awaited<ReturnType<typeof loadSuit>>;
const assets: Record<'archangel' | 'watcher', Asset> = {} as never;
let clips: AngelClips;
beforeAll(async () => {
  assets.archangel = await loadSuit('archangel'); assets.watcher = await loadSuit('watcher');
  clips = bindAngelClips(assets.archangel.animations);
});
beforeEach(() => cancelStrike());
const HAND = BONE_NAMES.indexOf('hand_r');
const FRAME = 1 / 30;
function marks(asset: Asset, name: string) {
  const clip = bindAngelClips(asset.animations)[name], times = Array.from(asset.animations.find(a => a.name === name)!.tracks[0].times);
  const rig = buildSuitRig(asset.scene), rest = rig.joints[0].position.clone(), hip = new Vector3(), path: Vector3[] = [];
  for (const t of times) {
    hip.set(0, 0, 0); blendAngelClip(rig.joints, clip, t, 1, FULL, hip);
    rig.joints[0].position.copy(rest).add(hip); rig.root.updateMatrixWorld(true);
    path.push(rig.joints[HAND].getWorldPosition(new Vector3()));
  }
  rig.dispose();
  const speed = path.map((_, k) => k === 0 || k === path.length - 1 ? 0 : path[k + 1].distanceTo(path[k - 1]) / (times[k + 1] - times[k - 1]));
  let peak = 0; speed.forEach((s, k) => { if (s > speed[peak]) peak = k; });
  let raised = 1; for (let k = 1; k < peak; k++) if (speed[k] < speed[raised]) raised = k;
  return { raised: times[raised], impact: times[peak], peakSpeed: speed[peak], at: (t: number) => path[Math.round(t / FRAME)] };
}
const emit = (kind: number, n = 0) => {
  const e = banish.fx[++banish.fxSerial % banish.fx.length]; e.serial = banish.fxSerial; e.kind = kind; e.t = banish.clock; e.n = n;
};
const flight = (over: Partial<AngelMotionInput> = {}): AngelMotionInput => ({ dt: 1 / 60, paused: false, flying: true, ground: 0, speed: 30, sword: true, ...over });

describe('the cut clips and their marks', () => {
  it('pins the build\'s marks (art/real-bodies/asset.json) for both bodies', () => {
    const manifest = JSON.parse(readFileSync('art/real-bodies/asset.json', 'utf8'));
    for (const body of ['archangel', 'watcher']) CUT_CLIPS.forEach(c => {
      expect(manifest[body].cuts[c.clip].raised, `${body} ${c.clip}`).toBeCloseTo(c.raised, 4);
      expect(manifest[body].cuts[c.clip].impact, `${body} ${c.clip}`).toBeCloseTo(c.impact, 4);
    });
  });
  for (const body of ['archangel', 'watcher'] as const) {
    it(`recomputes raised and impact from ${body}.glb within one frame`, () => {
      for (const c of CUT_CLIPS) {
        const m = marks(assets[body], c.clip);
        expect(Math.abs(m.raised - c.raised), `${c.clip} raised`).toBeLessThanOrEqual(FRAME + 1e-3);
        expect(Math.abs(m.impact - c.impact), `${c.clip} impact`).toBeLessThanOrEqual(FRAME + 1e-3);
        expect(m.impact).toBeGreaterThan(m.raised); expect(m.peakSpeed).toBeGreaterThan(3); // a real stroke, metres per second
      }
    });
  }
  it('gives the archangel each stroke and its recovery, and the Watcher the three strokes', () => {
    const angel = bindAngelClips(assets.archangel.animations), watcher = bindAngelClips(assets.watcher.animations);
    for (const c of CUT_CLIPS) {
      for (const name of [c.clip, c.rec]) { expect(angel[name], name).toBeDefined(); expect(angel[name].rotations.every(Boolean)).toBe(true); }
      expect(watcher[c.clip], c.clip).toBeDefined(); expect(angel[c.clip].duration).toBeGreaterThan(c.impact);
    }
    expect(angel.slash).toBeUndefined(); // the old single library cut is gone
    expect(cutClip(7)).toBe(CUT_CLIPS[0]);
  });
});

describe('the cuts on the angel (angelMotion)', () => {
  it('plays mocap at real time with no chest roll, and steps in no earlier than the clip start', () => {
    for (const cut of CUTS) { expect(cut.rate).toBe(1); expect('roll' in cut).toBe(false); }
    CUT_CLIPS.forEach((c, i) => expect(cutLead(i)).toBeCloseTo(Math.min(SLASH.lead, c.raised), 9));
    expect('raised' in SLASH).toBe(false);
  });
  it('holds each cut at its own raised blade through the dive and crossfades from it to the cut contact names, at that cut\'s raised blade', () => {
    const rig = buildSuitRig(assets.archangel.scene), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight());
    beginStrike(0, { x: 0, y: 0, z: -40 }, 40);
    for (let i = 0; i < 40; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe('slash'); expect(actClip(m)).toBe('cut0'); expect(m.actT).toBeCloseTo(cutClip(0).raised, 6);
    landStrike(true); emit(FX.sword, 2); stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.cut).toBe(2); expect(actClip(m)).toBe('cut2'); expect(m.from).toBe('cut0'); expect(m.fromW).toBe(1); expect(m.weight).toBeLessThan(.2);
    expect(m.actT).toBeGreaterThan(cutClip(2).raised); expect(m.actT).toBeLessThan(cutClip(2).raised + .05);
    for (let i = 0; i < Math.ceil(SLASH.cross * 60); i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.from).toBe(''); expect(m.weight).toBe(1);
    rig.dispose();
  });
  it('plays the recovery as the act\'s tail at full weight, and a new strike crossfades from it', () => {
    const rig = buildSuitRig(assets.archangel.scene), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight()); emit(FX.sword, 1);
    let tailAt = -1, weightAtTail = 0;
    for (let i = 0; i < 60 && tailAt < 0; i++) { stepAngelMotion(m, clips, rig.joints, flight()); if (m.tail) { tailAt = i; weightAtTail = m.weight; } }
    expect(tailAt).toBeGreaterThan(0); expect(actClip(m)).toBe('cut1Rec'); expect(weightAtTail).toBe(1); expect(m.actT).toBeLessThan(.05);
    const left = clips.cut1Rec.duration;
    for (let i = 0; i < 10; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe('slash'); expect(m.weight).toBe(1);
    beginStrike(0, { x: 0, y: 0, z: -4 }, 4, .2); stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.tail).toBe(false); expect(actClip(m)).toBe('cut0'); expect(m.actT).toBeLessThan(cutClip(0).raised + 1e-9); expect(m.from).toBe('cut1Rec');
    cancelStrike();
    for (let i = 0; i < Math.ceil((left + 1) * 60) && m.act; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.act).toBe(''); rig.dispose();
  });
  it('lets a command gesture replace the recovery tail, but never the stroke itself', () => {
    const rig = buildSuitRig(assets.archangel.scene), m = createAngelMotion();
    stepAngelMotion(m, clips, rig.joints, flight()); emit(FX.sword, 0); stepAngelMotion(m, clips, rig.joints, flight());
    emit(FX.cast); stepAngelMotion(m, clips, rig.joints, flight()); expect(m.act).toBe('slash');
    for (let i = 0; i < 60 && !m.tail; i++) stepAngelMotion(m, clips, rig.joints, flight());
    expect(m.tail).toBe(true); emit(FX.cast); stepAngelMotion(m, clips, rig.joints, flight()); expect(m.act).toBe('cast');
    rig.dispose();
  });
});

// Review of Stage B: the stroke faded out over its own last .25 s (on cut0 from before its impact), so the hand jumped 34 to 115 cm
// in one frame where the recovery began at full weight; and a cut begun in a recovery faded in from the pose beneath (25 to 132 cm).
describe('hand continuity across the cut seam and a cut begun in a recovery (60 fps)', () => {
  const ground = (): AngelMotionInput => flight({ flying: false, ground: 1, speed: 0 });
  /** Steps the angel as the game does (the joints back at rest first, as applySuitPose writes them) and returns hand_r's move. */
  function track(input: AngelMotionInput) {
    const rig = buildSuitRig(assets.archangel.scene), rest = rig.joints.map(j => j.quaternion.clone()), pelvis = rig.joints[0].position.clone();
    const m = createAngelMotion(), hand = new Vector3(), last = new Vector3();
    const step = () => {
      rig.joints.forEach((j, k) => j.quaternion.copy(rest[k])); rig.joints[0].position.copy(pelvis);
      stepAngelMotion(m, clips, rig.joints, input); rig.root.updateMatrixWorld(true);
      rig.joints[HAND].getWorldPosition(hand); const d = hand.distanceTo(last); last.copy(hand); return d;
    };
    for (let i = 0; i < 120; i++) step(); // the idle settles on the ground
    return { m, step, dispose: () => rig.dispose() };
  }
  for (const [label, input] of [['on the ground', ground], ['in flight', flight]] as const) {
    it(`holds each stroke's weight from its impact into its recovery, with no hand jump at the seam, ${label}`, () => {
      CUT_CLIPS.forEach((c, n) => {
        const t = track(input()), moves: number[] = []; let seam = -1, low = 1;
        emit(FX.sword, n);
        for (let i = 0; seam < 0 ? i < 90 : i <= seam + 3; i++) {
          moves.push(t.step());
          if (t.m.tail && seam < 0) seam = i;
          if (t.m.actT >= c.impact && !t.m.tail || i === seam) low = Math.min(low, t.m.weight);
        }
        expect(seam, c.clip).toBeGreaterThan(0); expect(low, c.clip).toBeGreaterThanOrEqual(.9);
        // The recovery's own start moves the hand up to 6 cm a frame on the ground.
        expect(Math.max(...moves.slice(seam - 3, seam + 4)), c.clip).toBeLessThan(.07);
        t.dispose();
      });
    });
    it(`crossfades a cut begun in a recovery from it, with no hand jump, ${label}`, () => {
      CUT_CLIPS.forEach((c, n) => {
        const t = track(input()), next = (n + 1) % CUT_CLIPS.length;
        emit(FX.sword, n);
        for (let i = 0; i < 90 && !t.m.tail; i++) t.step();
        for (let i = 0; i < 4; i++) t.step();
        emit(FX.sword, next); const first = t.step();
        expect(t.m.from).toBe(c.rec); expect(t.m.fromW).toBe(1); expect(actClip(t.m)).toBe(cutClip(next).clip);
        // The new stroke starts at its raised blade, already moving: the frame it begins moves the hand under 9 cm.
        expect(first, `${c.rec} to ${cutClip(next).clip}`).toBeLessThan(.09);
        t.dispose();
      });
    });
  }
  it('leaves nothing of the replaced clip once the new one is fully in, on a bone the mask takes in part (the flight spine)', () => {
    const rig = buildSuitRig(assets.archangel.scene), rest = rig.joints.map(j => j.quaternion.clone()), spine = BONE_NAMES.indexOf('spine');
    const pose = (under: number, plain = false) => {
      rig.joints.forEach((j, k) => j.quaternion.copy(rest[k]));
      if (plain) blendAngelClip(rig.joints, clips.cut1Rec, .3, 1, UPPER_BODY); else if (under >= 0) blendUnder(rig.joints, clips.cut1Rec, .3, 1, UPPER_BODY, under);
      blendAngelClip(rig.joints, clips.cut2, .65, under < 0 ? 1 : under, UPPER_BODY); return rig.joints[spine].quaternion.clone();
    };
    const alone = pose(-1); // (angleTo reads about 3e-4 rad of float noise near zero)
    expect(pose(1).angleTo(alone)).toBeLessThan(1e-3); expect(pose(1, true).angleTo(alone)).toBeGreaterThan(.02); // a plain layer stays
    rig.joints.forEach((j, k) => j.quaternion.copy(rest[k])); blendAngelClip(rig.joints, clips.cut1Rec, .3, 1, UPPER_BODY);
    expect(pose(0).angleTo(rig.joints[spine].quaternion)).toBeLessThan(1e-3);
    rig.dispose();
  });
});
