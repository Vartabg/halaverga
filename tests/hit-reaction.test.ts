import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Euler, Quaternion, Vector3 } from 'three';
import { loadSuit } from './load-suit';
import { wardenSetup } from './warden-support';
import { SHOVE, clearShove, hurtShove, lessShove, shoveAngel, shoveBase, shoveStep } from '../src/game/hurtShove';
import { FLIGHT, momentumVelocity } from '../src/game/momentumFlight';
import type { Intent } from '../src/game/motion';
import { createTurnSweep, sweepTurn } from '../src/game/turnSweep';
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
beforeEach(() => { cancelStrike(); clearShove(true); resetBattle(); });
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
  // Player.tsx's order, without the flight safety: shoveBase on the step's input, the real momentum flight, then shoveStep.
  const ahead: Intent = { forward: 1, strafe: 0, vertical: 0 }, dt = 1 / 60, own = SHOVE.speed * SHOVE.half / Math.LN2; // the shove's integral, m
  function fly(hit: { x: number; y: number; z: number } | null, intent = ahead, start = -FLIGHT.cruise) {
    clearShove(true); cancelStrike(); let flown = { x: 0, y: 0, z: start }, along = 0, across = 0, slowest = Infinity;
    const turn = createTurnSweep(), from = { x: 0, y: 0, z: 0 }, out = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 90; n++) {
      if (n === 5 && hit) shoveAngel(hit.x, hit.y, hit.z);
      const v = momentumVelocity(shoveBase(flown, { ...flown }), intent, 0, 0, true, false, dt), chosen = { ...v };
      shoveStep(v, dt, true); sweepTurn(turn, lessShove(flown, from, true), chosen, lessShove(v, out, false), 0, dt);
      flown = v; along -= v.z * dt; across += v.x * dt; slowest = Math.min(slowest, -v.z);
    }
    return { along, across, slowest, lateral: turn.lateral };
  }
  it('costs only its own distance and never compounds, whatever momentum flight carries over (head-on, from behind, side)', () => {
    const calm = fly(null), head = fly({ x: 0, y: 0, z: 1 }), back = fly({ x: 0, y: 0, z: -1 }), side = fly({ x: 1, y: 0, z: 0 });
    expect(calm.along - head.along).toBeGreaterThan(own * .95); expect(calm.along - head.along).toBeLessThan(own * 1.1);
    expect(head.slowest).toBeGreaterThan(FLIGHT.cruise - SHOVE.speed - .1); // still flying forward through a head-on hit
    expect(back.along - calm.along).toBeGreaterThan(own * .95); expect(back.along - calm.along).toBeLessThan(own * 1.1);
    expect(Math.abs(side.along - calm.along)).toBeLessThan(.01); expect(side.across).toBeGreaterThan(own * .95); expect(side.across).toBeLessThan(own * 1.1);
    for (const r of [head, back, side]) expect(Math.abs(r.lateral - calm.lateral)).toBeLessThan(1e-9); // the body never banks for it
    const glide = fly(null, { forward: 0, strafe: 0, vertical: 0 }), struck = fly({ x: 0, y: 0, z: 1 }, { forward: 0, strafe: 0, vertical: 0 });
    expect(glide.along - struck.along).toBeLessThan(own * 1.1); // released: the glide is not reversed either
  });
  it('takes out only what the flight safety left of it: shoved into a wall, nothing pulls the angel back off it', () => {
    shoveAngel(-1, 0, 0); const v = { x: 0, y: 0, z: 0 }; shoveStep(v, dt, true); expect(v.x).toBeCloseTo(-SHOVE.speed, 9);
    expect(shoveBase({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }).x).toBeCloseTo(0, 9); // the wall took all of it
    expect(shoveBase({ x: -SHOVE.speed / 2, y: 0, z: 0 }, { x: -SHOVE.speed / 2, y: 0, z: 0 }).x).toBeCloseTo(0, 9); // or half of it
    expect(shoveBase({ x: -SHOVE.speed, y: 0, z: 0 }, { x: -SHOVE.speed, y: 0, z: 0 }).x).toBeCloseTo(0, 9); // or none
  });
  it('is dropped while a strike runs (the strike owns the velocity) and off free flight; reduced motion keeps it', () => {
    shoveAngel(0, 0, 1); beginStrike(0, { x: 0, y: 0, z: -30 }, 30);
    const v = { x: 0, y: 0, z: -55 }; shoveStep(v, 1 / 60, true);
    expect(v).toEqual({ x: 0, y: 0, z: -55 }); expect(length(hurtShove)).toBe(0);
    cancelStrike(); shoveAngel(0, 0, 1); shoveStep(v, 1 / 60, false); expect(length(hurtShove)).toBe(0); // landing or on foot
    const player = readFileSync('src/game/Player.tsx', 'utf8'), line = player.split('\n').find(l => l.includes('strikeStep(v, p, dt'))!;
    expect(player).toContain('const vb = shoveBase(runtime.velocity, gestureBase(runtime.velocity, baseScratch));'); // out of the model's input
    expect(line).not.toContain('shoveStep'); // after the model, the strike and the gesture offset; the turn sweep never sees it:
    expect(player).toContain('chosen = { ...v }; shoveStep(v, dt, flying && !runtime.landGoal);');
    expect(player).toContain('sweepTurn(runtime.turn, lessShove(from, fromScratch, true), chosen, lessShove(runtime.velocity, flownScratch, false)');
    expect(readFileSync('src/game/hurtShove.ts', 'utf8')).toContain('export function shoveStep(v: Vec3, dt: number, on: boolean)'); // no reduced-motion switch: movement, not decoration
    expect(readFileSync('src/game/celestialBattle.ts', 'utf8')).toContain('shoveAngel(bolt.v.x, bolt.v.y, bolt.v.z)'); // darts too
  });
});

describe('the angel flinches when hit', () => {
  const input = (over: Partial<AngelMotionInput> = {}): AngelMotionInput => ({ dt: 1 / 60, paused: false, flying: true, ground: 0, speed: 0, sword: true, ...over });
  const chest = BONE_NAMES.indexOf('chest');
  /** Settles the body for `settle` frames (prone needs them at cruise), lands a hit, then traces 40 frames. `cut(n, input)` may change
   * the input mid-flinch (a retry). pitch: the chest's own pitch (+ arches back, - hunches). */
  function run(over: Partial<AngelMotionInput>, settle = 1, cut?: (n: number, i: AngelMotionInput) => void) {
    const rig = buildSuitRig(angel.scene), m = createAngelMotion(), trace: number[] = [], pitch: number[] = [], given = input(over);
    for (let n = 0; n < settle; n++) { for (const j of rig.joints) j.quaternion.identity(); stepAngelMotion(m, angelClips, rig.joints, given); }
    shoveAngel(0, 0, 1);
    for (let n = 0; n < 40; n++) {
      cut?.(n, given); for (const j of rig.joints) j.quaternion.identity();
      stepAngelMotion(m, angelClips, rig.joints, given); trace.push(m.flinch); pitch.push(new Euler().setFromQuaternion(rig.joints[chest].quaternion).x);
    }
    rig.dispose(); return { trace, pitch };
  }
  it('lasts about .35 s: hunched forward upright, the chest thrown back only while prone; reduced motion holds still', () => {
    const { trace, pitch } = run({}), peak = Math.max(...trace), at = trace.indexOf(peak) / 60;
    expect(peak).toBeGreaterThan(.95); expect(at).toBeGreaterThan(.1); expect(at).toBeLessThan(.25); expect(trace[Math.ceil(FLINCH.time * 60) + 1]).toBe(0);
    expect(Math.max(...pitch)).toBeLessThanOrEqual(1e-6); expect(Math.min(...pitch)).toBeLessThan(-FLINCH.hunch * .9); // the facing rule at hover
    const prone = run({ travel: FLIGHT.cruise }, 90); expect(Math.max(...prone.pitch)).toBeGreaterThan(FLINCH.arch * .9);
    expect(Math.max(...run({ reduced: true }).trace)).toBe(0);
    const suit = readFileSync('src/world/Suit.tsx', 'utf8');
    expect(suit).toContain('Math.max(pose.brake, moves.current.flinch)'); // the wings flare
  });
  it('ends when the pose epoch changes (a fatal hit pauses mid-flinch; Retry starts clean)', () => {
    const { trace } = run({ epoch: 1 }, 1, (n, i) => { if (n === 6) i.epoch = 2; });
    expect(trace[5]).toBeGreaterThan(.2); expect(Math.max(...trace.slice(6))).toBe(0);
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
  it('crossfades a blow landing during the last reaction (a string\'s next cut), never popping back to the flight pose', () => {
    const pool = createDemonActors(demon.scene, demon.animations), chest = 11, actor = pool.actors[0];
    pool.step(0, at, rotation, true, pose()); const rest = actor.joints[chest].quaternion.clone();
    let last = rest.clone(), lastYaw = 0, step = 0, near = Infinity, jump = 0;
    const frame = (hitT: number, side: number) => {
      pool.step(0, at, rotation, true, pose({ hitT, hitSide: side }));
      const q = actor.joints[chest].quaternion, yaw = 2 * Math.asin(actor.root.quaternion.y);
      step = Math.max(step, q.angleTo(last)); near = Math.min(near, q.angleTo(rest)); jump = Math.max(jump, Math.abs(yaw - lastYaw));
      last = q.clone(); lastYaw = yaw;
    };
    for (let t = 0; t < .5; t += 1 / 60) frame(t, 1); // the first cut's reaction, half through
    const yawBefore = lastYaw; step = 0; near = Infinity; jump = 0;
    frame(0, -1); const first = Math.abs(lastYaw - yawBefore); // the next cut lands, turning the other way: the yaw carries on
    for (let t = 1 / 60; t < .4; t += 1 / 60) frame(t, -1);
    expect(near).toBeGreaterThan(.05); // never back at the flight pose between the cuts (it was .0004: a one-frame pop)
    expect(step).toBeLessThan(.05); expect(first).toBeLessThan(.02); expect(jump).toBeLessThan(.25); // a crossfade, the yaw carried over
    pool.dispose();
  });
  it('turns the body by the cut: the level cross cut fully, the rising cut half the other way, the upright casting blow not at all', () => {
    expect(cutTwist(CUTS[0])).toBeCloseTo(-Math.cos(CUTS[0].arc), 6); expect(cutTwist(CUTS[0])).toBeLessThan(-.9);
    expect(cutTwist(CUTS[1])).toBeGreaterThan(.4); expect(cutTwist(CUTS[1])).toBeLessThan(.6); expect(cutTwist(CUTS[2])).toBe(0);
    const drones = readFileSync('src/world/Drones.tsx', 'utf8');
    expect(drones).toContain('hitT: t - f.lastHit[i], hitSide: banish.twist[i]');
  });
});
