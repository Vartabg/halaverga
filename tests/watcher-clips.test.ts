import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { WA } from '../src/game/banishState';
import { CLEAVE } from '../src/game/wardenTactics';
import { cutClip } from '../src/world/cutClips';
import { WARDEN_BLEND, hitClipName, wardenClip, type PhaseClip } from '../src/world/watcherClips';
import { createDemonActors, type DemonPose } from '../src/world/demonActors';
import { bindAngelClips, type AngelClips } from '../src/world/angelClips';
import { loadSuit } from './load-suit';

// docs/plans/2026-11-16-real-fight.md B7: the reaction clip is chosen at the blow, and a warden plays a clip per attack phase.
let asset: Awaited<ReturnType<typeof loadSuit>>, clips: AngelClips;
beforeAll(async () => { asset = await loadSuit('watcher'); clips = bindAngelClips(asset.animations); });
const out: PhaseClip = { name: '', time: 0, weight: 0 };
const play = (phase: number, time: number, move = 0, tell = 1.3, rush = .8, reduced = false) =>
  wardenClip(out, clips, phase, time, move, tell, rush, reduced) ? { ...out } : null;

describe('the reaction clip for each blow', () => {
  it('maps the cross cut to a body hit, the rising cut to a head hit and the casting blow to the knock back; anything else a hit', () => {
    expect([0, 1, 2, -1, 7].map(hitClipName)).toEqual(['hit', 'hitHead', 'knock', 'hit', 'hit']);
    for (const name of ['hit', 'hitHead', 'knock']) expect(clips[name]).toBeDefined();
  });
  it('records each sword blow\'s cut at the clock it set, so a later shot or rebuke reads as a plain hit', () => {
    expect(readFileSync('src/game/swordBlow.ts', 'utf8')).toContain('b.blow[i] = n; b.blowAt[i] = f.lastHit[i];');
    expect(readFileSync('src/world/Drones.tsx', 'utf8')).toContain('blow: banish.blowAt[i] === f.lastHit[i] ? banish.blow[i] : -1');
  });
  it('keeps the chosen clip on the actor beside the reaction a new blow interrupts', () => {
    const pool = createDemonActors(asset.scene, asset.animations), a = pool.actors[0], at = new Vector3(), q = new Quaternion();
    const pose = (over: Partial<DemonPose>): DemonPose => ({ time: 1, charging: false, hit: 0, down: false, reduced: false, damage: 0, ...over });
    const own = pool.clips;
    pool.step(0, at, q, true, pose({ hitT: 0, blow: 1 })); expect(a.clip).toBe(own.hitHead);
    pool.step(0, at, q, true, pose({ hitT: .2, blow: 1 }));
    pool.step(0, at, q, true, pose({ hitT: 0, blow: -1 })); expect(a.clip).toBe(own.hit); expect(a.oldClip).toBe(own.hitHead); expect(a.oldT).toBeCloseTo(.2, 6);
    // The casting blow: its knock back plays out while the fall comes in, rather than the fall replacing it at once.
    pool.step(0, at, q, true, pose({ hitT: .3, blow: -1 }));
    pool.step(0, at, q, true, pose({ hitT: 0, blow: 2, down: true })); expect(a.clip).toBe(own.knock);
    const early = a.joints[0].quaternion.clone();
    for (let t = 1 / 60; t < clips.knock.duration / .7 + .1; t += 1 / 60) pool.step(0, at, q, true, pose({ time: 1 + t, hitT: t, blow: 2, down: true }));
    expect(early.angleTo(a.joints[0].quaternion)).toBeGreaterThan(.05);
    pool.dispose();
  });
});

describe('a warden\'s clip per attack phase', () => {
  it('holds only the guard through the tell of a rush or a sweep', () => {
    for (const move of [WA.rush, WA.sweep]) for (const t of [0, .6, 1.29]) expect(play(WA.tell, t, move)).toBeNull();
  });
  it('lands the fan\'s and the volley\'s stroke impact on the bolt release at the start of the phase, the windup in the tell', () => {
    for (const [move, cut] of [[WA.fan, 1], [WA.volley, 0]] as const) {
      const c = cutClip(cut), tell = 1.3;
      expect(play(WA.tell, tell - c.impact - .01, move)).toBeNull();
      const windup = play(WA.tell, tell - c.impact + .2 * c.impact, move)!;
      expect(windup.name).toBe(c.clip); expect(windup.time).toBeCloseTo(.2 * c.impact, 6);
      expect(play(WA.tell, tell - 1e-6, move)!.time).toBeCloseTo(c.impact, 4); // the tell ends at the impact...
      const release = play(move, 0)!; expect(release.name).toBe(c.clip); expect(release.time).toBeCloseTo(c.impact, 9); // ...where the phase begins
      expect(release.weight).toBe(1);
      expect(play(move, 5)!.time).toBeCloseTo(clips[c.clip].duration, 6); // and holds the stroke's end
    }
  });
  it('scales the rush to its reach over the rush speed and the sweep to the cleave, then blocks through the recovery', () => {
    const rush = .8;
    expect(play(WA.rush, rush / 2, 0, 1.3, rush)!.time).toBeCloseTo(clips.rush.duration / 2, 6);
    expect(play(WA.rush, rush, 0, 1.3, rush)!.time).toBeCloseTo(clips.rush.duration, 6);
    const sweep = play(WA.sweep, CLEAVE.duration * cutClip(2).impact / clips.cut2.duration)!;
    expect(sweep.name).toBe('cut2'); expect(sweep.time).toBeCloseTo(cutClip(2).impact, 6); // the impact inside the cleave's quarter second
    expect(play(WA.sweep, 0)!.weight).toBe(0); expect(play(WA.sweep, WARDEN_BLEND.phase)!.weight).toBe(1);
    expect(play(WA.recover, .5)!.name).toBe('block'); expect(play(WA.recover, 2.4)!.time).toBeCloseTo(clips.block.duration, 6);
    expect(play(WA.idle, 1)).toBeNull();
  });
  it('holds one frame per phase at a lower weight under reduced motion', () => {
    for (const phase of [WA.rush, WA.sweep, WA.fan, WA.volley, WA.recover]) {
      const a = play(phase, .1, 0, 1.3, .8, true)!, b = play(phase, .9, 0, 1.3, .8, true)!;
      expect(a).toEqual(b); expect(a.weight).toBe(WARDEN_BLEND.reduced);
    }
    expect(play(WA.tell, 1.25, WA.fan, 1.3, .8, true)).toBeNull();
  });
});
