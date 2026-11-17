import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { wardenSetup } from './warden-support';
import { SHOVE, clearShove, hurtShove, shoveAngel, shoveStep } from '../src/game/hurtShove';
import { battle, resetBattle } from '../src/game/celestialBattle';
import { wardenDamage } from '../src/game/wardenMath';
import { beginStrike, cancelStrike } from '../src/game/strike';
import { createShooter } from '../src/game/combat';
import { CUTS } from '../src/game/swordString';
import { cutTwist } from '../src/game/swordBlow';
import { bindAngelClips, type AngelClips } from '../src/world/angelClips';
import { FLINCH, createAngelMotion, stepAngelMotion, type AngelMotionInput } from '../src/world/angelMotion';
import { REACT, createDemonActors, reactionLength, reactionWeight, type DemonPose } from '../src/world/demonActors';
import { buildSuitRig } from '../src/world/suitRig';
import { BONE_NAMES } from '../src/world/suitSkeleton';

// Plan 2026-11-16-real-fight A3: blows land on bodies. The angel is shoved and flinches; a struck Watcher plays its whole hit
// reaction and turns the way the cut pushed it.
let angel: Awaited<ReturnType<typeof loadSuit>>, demon: Awaited<ReturnType<typeof loadSuit>>, angelClips: AngelClips;
beforeAll(async () => { angel = await loadSuit('angel'); demon = await loadSuit('abyssal'); angelClips = bindAngelClips(angel.animations); });
beforeEach(() => { cancelStrike(); clearShove(); resetBattle(); });
const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('the angel is shoved by a blow (hurtShove.ts)', () => {
  it('is set by wardenDamage away from the attacker at SHOVE.speed, once per landed blow', () => {
    const s = createShooter(), serial = hurtShove.serial;
    wardenDamage(s, { x: 0, y: 30, z: 0 }, { x: 3, y: 30, z: 4 });
    expect(hurtShove.serial).toBe(serial + 1); expect(length(hurtShove)).toBeCloseTo(SHOVE.speed, 6);
    expect(hurtShove.x / SHOVE.speed).toBeCloseTo(.6, 6); expect(hurtShove.z / SHOVE.speed).toBeCloseTo(.8, 6);
    clearShove(); wardenDamage(s, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); // inside the grace after a hit: no ward lost, no shove
    expect(length(hurtShove)).toBe(0); expect(hurtShove.serial).toBe(serial + 1);
  });
  it('comes from a warden rush that lands, along the rush', () => {
    const { w, i, step, tick } = wardenSetup(); step(); tick(2.4);
    expect(battle.ward).toBe(2); expect(w.result).toBe('hit');
    expect(hurtShove.z).toBeGreaterThan(0); // the warden at z 0 rushed the angel at z 20
  });
  it('decays with its half-life and never compounds, whatever the flight model carries over', () => {
    shoveAngel(1, 0, 0);
    const v = { x: 0, y: 0, z: -22 }, dt = 1 / 60; // cruising away from the blow's side; the flight model keeps the velocity
    let peak = 0;
    for (let n = 0; n < 60; n++) {
      shoveStep(v, dt, true); peak = Math.max(peak, v.x);
      if (n === Math.round(SHOVE.half / dt)) expect(v.x).toBeCloseTo(SHOVE.speed / 2, 0);
    }
    expect(peak).toBeCloseTo(SHOVE.speed, 6); expect(v.x).toBeLessThan(.2); expect(v.z).toBeCloseTo(-22, 6);
    // Shoved straight back against a charge: the charge is spent, the angel knocked back, and it never runs away.
    clearShove(); shoveAngel(0, 0, 1); const charge = { x: 0, y: 0, z: -22 };
    for (let n = 0; n < 60; n++) { shoveStep(charge, dt, true); expect(Math.abs(charge.z)).toBeLessThan(22 + 1e-6); }
  });
  it('is dropped while a strike runs (the strike owns the velocity) and off free flight; reduced motion keeps it', () => {
    shoveAngel(0, 0, 1); beginStrike(0, { x: 0, y: 0, z: -30 }, 30);
    const v = { x: 0, y: 0, z: -55 }; shoveStep(v, 1 / 60, true);
    expect(v).toEqual({ x: 0, y: 0, z: -55 }); expect(length(hurtShove)).toBe(0);
    cancelStrike(); shoveAngel(0, 0, 1); shoveStep(v, 1 / 60, false); expect(length(hurtShove)).toBe(0); // landing or on foot
    const player = readFileSync('src/game/Player.tsx', 'utf8'), line = player.split('\n').find(l => l.includes('strikeStep(v, p, dt'))!;
    expect(line).toContain('strikeStep(v, p, dt, state.reduced, runtime.flown, look); shoveStep(v, dt, flying && !runtime.landGoal);');
    expect(readFileSync('src/game/hurtShove.ts', 'utf8')).toContain('export function shoveStep(v: Vec3, dt: number, on: boolean)'); // no reduced-motion switch: movement, not decoration
    expect(readFileSync('src/game/celestialBattle.ts', 'utf8')).toContain('shoveAngel(bolt.v.x, bolt.v.y, bolt.v.z)'); // darts too
  });
});

describe('the angel flinches when hit', () => {
  const input = (over: Partial<AngelMotionInput> = {}): AngelMotionInput => ({ dt: 1 / 60, paused: false, flying: true, ground: 0, speed: 0, sword: true, ...over });
  const chest = BONE_NAMES.indexOf('chest');
  function run(over: Partial<AngelMotionInput>) {
    const rig = buildSuitRig(angel.scene), m = createAngelMotion(), trace: number[] = [], bend: number[] = [];
    stepAngelMotion(m, angelClips, rig.joints, input(over)); shoveAngel(0, 0, 1);
    for (let n = 0; n < 40; n++) {
      for (const j of rig.joints) j.quaternion.identity();
      stepAngelMotion(m, angelClips, rig.joints, input(over)); trace.push(m.flinch); bend.push(rig.joints[chest].quaternion.angleTo(new Quaternion()));
    }
    rig.dispose(); return { trace, bend };
  }
  it('throws the chest back for about .35 s and then lets go; reduced motion holds still', () => {
    const { trace, bend } = run({}), peak = Math.max(...trace), at = trace.indexOf(peak) / 60;
    expect(peak).toBeGreaterThan(.95); expect(at).toBeGreaterThan(.1); expect(at).toBeLessThan(.25);
    expect(trace[Math.ceil(FLINCH.time * 60) + 1]).toBe(0); expect(Math.max(...bend)).toBeGreaterThan(FLINCH.chest * .9);
    expect(Math.max(...run({ reduced: true }).trace)).toBe(0);
    const suit = readFileSync('src/world/Suit.tsx', 'utf8');
    expect(suit).toContain('Math.max(pose.brake, moves.current.flinch)'); // the wings flare
  });
});

describe('a struck Watcher plays its whole reaction (demonActors.ts)', () => {
  const pose = (over: Partial<DemonPose> = {}): DemonPose => ({ time: 1, charging: false, hit: 0, down: false, reduced: false, damage: 0, ...over });
  const at = new Vector3(2, 30, -4), rotation = new Quaternion();
  it('weights the hit clip over its whole length from the hit clock, not by a fading one-frame blend', () => {
    const duration = bindAngelClips(demon.animations).hit.duration, end = reactionLength(duration);
    expect(end).toBeGreaterThan(duration); expect(reactionWeight(-.01, duration)).toBe(0); expect(reactionWeight(end, duration)).toBe(0);
    for (let t = REACT.fadeIn; t < end - REACT.fadeOut; t += .01) expect(reactionWeight(t, duration)).toBeCloseTo(REACT.weight, 6);
  });
  it('moves the upper body through the reaction and back, yaws the root toward the cut\'s side and leaves the position alone', () => {
    const pool = createDemonActors(demon.scene, demon.animations), duration = pool.clips.hit.duration, end = reactionLength(duration);
    const chest = 11, still = () => { pool.step(0, at, rotation, true, pose()); return pool.actors[0].joints[chest].quaternion.clone(); };
    const rest = still(), poses: Quaternion[] = [], yaws: number[] = [];
    for (let t = 0; t <= end + .1; t += .02) {
      pool.step(0, at, rotation, true, pose({ hitT: t, hitSide: 1 }));
      poses.push(pool.actors[0].joints[chest].quaternion.clone()); yaws.push(2 * Math.asin(pool.actors[0].root.quaternion.y));
      expect(pool.actors[0].root.position.distanceTo(at)).toBeLessThan(1e-9);
    }
    const moved = poses.map(q => q.angleTo(rest));
    expect(Math.max(...moved.slice(2, Math.floor(duration / REACT.rate / .02)))).toBeGreaterThan(.1); // the reaction plays
    expect(moved.filter(a => a > .05).length).toBeGreaterThan(8); // over many frames, not one
    expect(moved[moved.length - 1]).toBeLessThan(1e-3); // and is over (angleTo's own rounding near 0)
    expect(Math.max(...yaws)).toBeCloseTo(REACT.yaw, 2); expect(yaws[yaws.length - 1]).toBeCloseTo(0, 6);
    pool.step(0, at, rotation, true, pose({ hitT: REACT.snap, hitSide: -.5 })); expect(2 * Math.asin(pool.actors[0].root.quaternion.y)).toBeCloseTo(-.5 * REACT.yaw, 3);
    pool.step(0, at, rotation, true, pose({ hitT: REACT.snap, hitSide: 1, reduced: true })); expect(pool.actors[0].root.quaternion.y).toBe(0);
    pool.step(0, at, rotation, true, pose({ hitT: REACT.snap, hitSide: 1, down: true })); expect(pool.actors[0].root.quaternion.y).toBe(0);
    pool.dispose();
  });
  it('turns the body by the cut: the level cross cut fully, the rising cut half the other way, the upright casting blow not at all', () => {
    expect(cutTwist(CUTS[0])).toBeCloseTo(-Math.cos(CUTS[0].arc), 6); expect(cutTwist(CUTS[0])).toBeLessThan(-.9);
    expect(cutTwist(CUTS[1])).toBeGreaterThan(.4); expect(cutTwist(CUTS[1])).toBeLessThan(.6); expect(cutTwist(CUTS[2])).toBe(0);
    const drones = readFileSync('src/world/Drones.tsx', 'utf8');
    expect(drones).toContain('hitT: t - f.lastHit[i], hitSide: banish.twist[i]');
  });
});
