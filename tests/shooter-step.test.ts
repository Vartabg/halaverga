import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookGain, moveMode, pressAim, pressFire, releaseAim, releaseFire, resetShooterFeel, tapShot, type ShooterState, type Vec3 } from '../src/game/combat';
import { createAssistMemory } from '../src/game/aimAssist';
import { createDroneSim, type DroneSim } from '../src/game/drones';
import { ARM_HOLD, createStepContext, droneContext, stepShooter, type AudioSink, type StepContext } from '../src/game/shooterStep';
import { SHOT_GAIN_LATE, burst, resetBurst } from '../src/game/burst';
import { runtime } from '../src/game/runtime';
import { clearShooterFault, guarded } from '../src/game/shooterFault';
import { useGame } from '../src/game/store';
import { PHASE, createShooter } from '../src/game/combat';
afterEach(() => { clearShooterFault(); vi.restoreAllMocks(); resetBurst(); });
/** Stub Rapier queries: a wall `wall` m along every shot ray (or none) and clear sight lines. Counts castShot calls. */
function stubWorld(wall = Infinity) {
  const w = { casts: 0, castShot: (_o: Vec3, d: Vec3, maxT: number, out: { t: number; normal: Vec3 }) => {
    w.casts++; if (!(wall < maxT)) return false;
    out.t = wall; out.normal.x = -d.x; out.normal.y = -d.y; out.normal.z = -d.z; return true;
  }, lineClear: () => true };
  return w;
}
const ORIGIN = { x: 0, y: 30, z: 80 };
type Rig = { s: ShooterState; sim: DroneSim; ctx: StepContext; world: ReturnType<typeof stubWorld>; audio: AudioSink; played: string[] };
/** Camera at ORIGIN looking along `dir`; one drone (index 0, tutorial-locked, eye facing away at first) at `drone`, or none. */
function rig(dir: Vec3 = { x: 0, y: 1, z: 0 }, drone: Vec3 | null = null, wall = Infinity, s = createShooter()): Rig {
  const sim = createDroneSim(s), ctx = createStepContext(), played: string[] = [];
  s.drones.count = drone ? 1 : 0;
  if (drone) {
    // Alerted where it stands, so it orbits a few metres from `drone` instead of racing back to its patrol loop.
    const f = s.drones; f.phase[0] = PHASE.alert; f.yaw[0] = 0; f.pitch[0] = 0; f.los[0] = 1;
    for (const v of [f.pos[0], f.home[0], f.anchor[0], sim.prev[0]]) Object.assign(v, drone);
  }
  const a = s.aim; a.valid = true; Object.assign(a.origin, ORIGIN); aim(s, dir);
  a.right.x = 1; a.right.y = 0; a.right.z = 0; a.up.x = 0; a.up.y = 1; a.up.z = 0;
  Object.assign(ctx.head, ORIGIN); Object.assign(ctx.player, ORIGIN); ctx.dt = 1 / 60; ctx.flying = true;
  return { s, sim, ctx, world: stubWorld(wall), audio: kind => { played.push(kind); }, played };
}
function aim(s: ShooterState, d: Vec3) { const l = Math.hypot(d.x, d.y, d.z); s.aim.dir.x = d.x / l; s.aim.dir.y = d.y / l; s.aim.dir.z = d.z / l; }
const step = (r: Rig, frames = 1) => { for (let i = 0; i < frames; i++) stepShooter(r.s, r.sim, mem, r.world, r.ctx, r.audio); };
/** Re-aims at drone 0 where it is drawn, then steps (the drone patrols, orbits and flinches between frames). */
const track = (r: Rig, frames = 1) => {
  for (let i = 0; i < frames; i++) { const p = r.s.drones.pos[0], k = r.s.drones.knock[0]; aim(r.s, { x: p.x + k.x - ORIGIN.x, y: p.y + k.y - ORIGIN.y, z: p.z + k.z - ORIGIN.z }); step(r); }
};
const mem = createAssistMemory();
const snapshot = (r: Rig) => structuredClone({ s: r.s, sim: { ...r.sim, rng: null }, ctx: r.ctx });
const DEG = Math.PI / 180;
/** Direction from ORIGIN that passes `angle` rad to the side of the point p (horizontal plane). */
function offset(p: Vec3, angle: number): Vec3 {
  const x = p.x - ORIGIN.x, z = p.z - ORIGIN.z, c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c - z * s, y: 0, z: x * s + z * c };
}
describe('shooter step', () => {
  it('mutates nothing while paused', () => {
    const r = rig(); pressFire(r.s, 'click'); pressAim(r.s, false); r.ctx.paused = true;
    const before = snapshot(r); step(r, 10);
    expect(snapshot(r)).toEqual(before); expect(r.world.casts).toBe(0); expect(r.played).toEqual([]);
  });
  it('fires nothing until the camera ray is published', () => {
    const r = rig(); r.s.aim.valid = false; pressFire(r.s, 'click'); step(r, 30);
    expect(r.s.stats.shots).toBe(0); expect(r.s.weapon.shots).toBe(0);
  });
  it('fires a press in the same call, and a press released before the call exactly once', () => {
    const r = rig(); pressFire(r.s, 'click'); step(r);
    expect(r.s.stats.shots).toBe(1); expect(r.s.events[0].kind).toBe('miss'); expect(r.played.slice(0, 1)).toEqual(['fire']);
    const q = rig(); pressFire(q.s, 'click'); releaseFire(q.s, 'click'); step(q, 60);
    expect(q.s.stats.shots).toBe(1);
  });
  it('fires the same number of shots in 2 s at 30, 60, 120 and 165 Hz', () => {
    const counts = [30, 60, 120, 165].map(hz => {
      const r = rig(); r.ctx.dt = 1 / hz; pressFire(r.s, 'click'); step(r, 2 * hz); return r.s.stats.shots;
    });
    expect(counts[0]).toBeGreaterThanOrEqual(18); expect(new Set(counts).size).toBe(1);
  });
  it('kicks the camera per shot, never under reduced motion, and never punches the FOV', () => {
    const r = rig(); tapShot(r.s); step(r); expect(r.s.camFx.kickPv).toBeGreaterThan(0);
    pressFire(r.s, 'click'); for (let i = 0; i < 60; i++) { step(r); expect([r.s.camFx.fovShot, r.s.camFx.fovShotV]).toEqual([0, 0]); }
    const q = rig(); q.ctx.reduced = true; tapShot(q.s); step(q);
    expect(q.s.stats.shots).toBe(1); expect(Object.values(q.s.camFx).every(v => v === 0)).toBe(true);
  });
  it('damages a drone on the ray, and a kill updates stats, chain and trauma', () => {
    const at = { x: 0, y: 30, z: 68 }, r = rig({ x: 0, y: 0, z: -1 }, at), f = r.s.drones;
    tapShot(r.s); step(r);
    expect(r.s.events[0].kind).toBe('hit'); expect(f.hp[0]).toBe(5); expect(r.s.stats.hits).toBe(1);
    for (let k = 0; k < 12 && r.s.stats.kills === 0; k++) { track(r, 8); tapShot(r.s); track(r); }
    // The alerted drone turns its eye toward the player, so some hits land on the weakpoint (2 damage).
    expect(r.s.stats.kills).toBe(1); expect(r.s.stats.chain).toBe(1); expect(r.s.stats.hits).toBeGreaterThanOrEqual(3); expect(r.s.stats.hits).toBeLessThanOrEqual(6);
    const e = r.s.events[(r.s.eventSerial - 1) % 16].kind === 'kill' ? r.s.events[(r.s.eventSerial - 1) % 16] : r.s.events.find(v => v.kind === 'kill')!;
    const p = e.point, d = Math.hypot(p.x - ORIGIN.x, p.y - ORIGIN.y, p.z - ORIGIN.z);
    expect(r.s.camFx.trauma).toBeCloseTo(.45 * (1 - d / 20) - 1 / 60, 12);
    // No FOV punch on shots or kills: only the kill's small rotational shake.
    for (const k of ['fovShot', 'fovShotV', 'fovKill', 'fovKillV'] as const) expect(r.s.camFx[k]).toBe(0);
    expect(r.s.targets[0].alive).toBe(false); expect(r.played).toContain('kill');
  });
  it('grants a magnetised body hit near the edge for touch but not for mouse', () => {
    const at = { x: 0, y: 30, z: 60 }, rho = Math.asin(.9 / 20);
    const shoot = (src: 'touch' | 'mouse') => {
      const r = rig(offset(at, rho + .6 * DEG), at); r.s.input.lookSource = src; pressAim(r.s, false); r.s.aim.blend = 1;
      tapShot(r.s); step(r); return r.s.events[0].kind;
    };
    expect(shoot('touch')).toBe('hit'); expect(shoot('mouse')).toBe('miss');
  });
  it('stops tap fire when its window ends and on overheat', () => {
    const r = rig(); pressFire(r.s, 'tap'); r.s.input.tapFireUntil = r.s.clock + 3;
    for (let i = 0; i < 179; i++) { step(r); r.s.weapon.heat = 0; }
    expect(r.s.input.fire).toBe(true); step(r, 2); expect(r.s.input.fire).toBe(false);
    const q = rig(); pressFire(q.s, 'tap'); q.s.input.tapFireUntil = q.s.clock + 3;
    while (q.s.input.fire && q.s.clock < 3) step(q);
    expect(q.s.clock).toBeLessThan(2.6); expect(q.s.weapon.lock).toBeGreaterThan(0);
    expect(q.s.events.some(e => e.kind === 'overheat')).toBe(true); expect(q.played).toContain('overheat');
  });
  it('reports hip-fire and aim movement modes', () => {
    const r = rig(); expect(moveMode(r.s)).toBe(0);
    pressFire(r.s, 'keys'); step(r); expect(moveMode(r.s)).toBe(1);
    releaseFire(r.s, 'keys'); pressAim(r.s, false); step(r); expect(moveMode(r.s)).toBe(2);
  });
  it('returns every feel channel to exactly 0 within 3 s of the last shot, and then casts no aim ray', () => {
    const at = { x: 0, y: 30, z: 60 }, r = rig({ x: 0, y: 0, z: -1 }, at, 40);
    r.s.drones.hp[0] = 100; // survives the burst, so the assist stays engaged on it
    r.s.input.lookSource = 'touch'; pressAim(r.s, false); pressFire(r.s, 'touch'); track(r, 40);
    expect(r.s.aim.blend).toBe(1); expect(r.s.assist.slow).toBeGreaterThan(0); expect(r.s.camFx.kickP).not.toBe(0);
    releaseFire(r.s, 'touch'); releaseAim(r.s); step(r, 180);
    expect(r.s.aim.blend).toBe(0); expect(r.s.aim.fireHold).toBe(0); expect(r.s.assist.slow).toBe(0);
    for (const [k, v] of Object.entries(r.s.camFx)) expect([k, v]).toEqual([k, 0]);
    const casts = r.world.casts; step(r, 30); expect(r.world.casts).toBe(casts);
  });
  it('passes look through exactly after resetShooterFeel from an engaged touch state', () => {
    const at = { x: 0, y: 30, z: 60 }, r = rig({ x: 0, y: 0, z: -1 }, at, 40), out = { x: 0, y: 0 };
    r.s.input.lookSource = 'touch'; pressFire(r.s, 'touch'); track(r, 5);
    // Against the target's drift, so the dynamic boost does not lift the friction.
    const dx = r.s.assist.driftYaw > 0 ? 3 : -3;
    expect(r.s.assist.slow).toBeCloseTo(.6, 12); expect(lookGain(r.s, dx, -2, out).x).toBeCloseTo(dx * .4, 12);
    resetShooterFeel(r.s); expect(lookGain(r.s, dx, -2, out)).toEqual({ x: dx, y: -2 });
  });
  it('turns the blaster off on a frame fault, resets the feel and ignores later frames', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useGame.setState({ shooter: true, message: '' });
    const s = runtime.shooter; resetShooterFeel(s);
    const r = rig(undefined, null, Infinity, s);
    r.world.castShot = () => { throw new Error('rapier gone'); };
    const frame = guarded('Shooter', (_: unknown, dt: number) => { r.ctx.dt = dt; stepShooter(s, r.sim, mem, r.world, r.ctx, r.audio); });
    pressFire(s, 'click'); frame(null, 1 / 60);
    expect(useGame.getState().shooter).toBe(false); expect(useGame.getState().message).toBe('The blaster stopped. Flight continues.');
    expect(s.input.fire).toBe(false); expect(s.aim.fireHold).toBe(0);
    const clock = s.clock; pressFire(s, 'click'); frame(null, 1 / 60); expect(s.clock).toBe(clock);
  });
  it('shows blocked only from a real muzzle: first person over a ledge never flags it, shot or no shot', () => {
    // The camera ray clears a ledge to a far wall; anything cast from elsewhere (the old virtual muzzle) hits the ledge at 1 m.
    const r = rig({ x: 0, y: 0, z: -1 }), from = (o: Vec3) => Math.hypot(o.x - ORIGIN.x, o.y - ORIGIN.y, o.z - ORIGIN.z) < 1e-6;
    r.world.castShot = (o, d, maxT, out) => { r.world.casts++; out.t = from(o) ? 40 : 1; out.normal.x = -d.x; out.normal.y = -d.y; out.normal.z = -d.z; return out.t < maxT; };
    r.ctx.firstPerson = true; r.s.muzzle.valid = false; pressAim(r.s, false);
    for (let i = 0; i < 30; i++) { step(r); expect(r.s.aim.blocked).toBe(false); }
    tapShot(r.s); step(r);
    expect(r.s.events[0].kind).toBe('world'); expect(r.s.aim.blocked).toBe(false);
    step(r); expect(r.s.aim.blocked).toBe(false);
  });
  it('casts no ray idle, then one aim ray plus a muzzle ray on alternate frames while aiming', () => {
    const r = rig({ x: 0, y: 0, z: -1 }, null, 40), m = r.s.muzzle;
    Object.assign(m, { x: ORIGIN.x + .5, y: ORIGIN.y - .4, z: ORIGIN.z - 1, valid: true, weight: 1 });
    step(r, 60); expect(r.world.casts).toBe(0);
    pressAim(r.s, false); step(r, 60);
    expect(r.world.casts).toBeGreaterThanOrEqual(60); expect(r.world.casts).toBeLessThanOrEqual(91);
    // The held glyph still follows a real block within one frame.
    r.world.castShot = (o, d, maxT, out) => { r.world.casts++; out.t = o === m ? 2 : 40; out.normal.x = -d.x; out.normal.y = -d.y; out.normal.z = -d.z; return out.t < maxT; };
    step(r, 2); expect(r.s.aim.blocked).toBe(true);
  });
  it('raises the arm fully on the press frame, holds it for ARM_HOLD, then lowers it 95% in 333 ms', () => {
    const r = rig(); pressFire(r.s, 'click'); step(r); expect(r.s.aim.fireHold).toBe(1);
    const q = rig(); tapShot(q.s); step(q); expect(q.s.stats.shots).toBe(1); expect(q.s.aim.fireHold).toBe(1);
    while (q.s.weapon.sinceShot < ARM_HOLD - 1e-9) { expect(q.s.aim.fireHold).toBe(1); step(q); }
    while (q.s.weapon.sinceShot < ARM_HOLD + .1) step(q);
    expect(q.s.aim.fireHold).toBeGreaterThan(.2); expect(q.s.aim.fireHold).toBeLessThan(1);
    while (q.s.weapon.sinceShot < ARM_HOLD + .34) step(q);
    expect(q.s.aim.fireHold).toBeLessThanOrEqual(.05);
    // Once lowered to exactly 0, a lone tapShot (a pending press, no held trigger) raises it fully on its own frame again.
    while (q.s.aim.fireHold > 0) step(q);
    tapShot(q.s); step(q); expect(q.s.stats.shots).toBe(2); expect(q.s.aim.fireHold).toBe(1);
  });
  it('leaves an idle shooter bit-identical: no feel channel, burst or ray moves', () => {
    const r = rig(), pick = () => structuredClone({ a: r.s.aim, w: r.s.weapon, fx: r.s.camFx, as: r.s.assist, st: r.s.stats, i: r.s.input, b: burst });
    step(r, 120); expect(r.s.aim.fireHold).toBe(0); expect(r.s.camFx.kickP).toBe(0); // the spread's move multiplier settles first
    const before = pick(); step(r, 240);
    expect(pick()).toEqual(before); expect(r.world.casts).toBe(0); expect(r.played).toEqual([]);
  });
  it('plays the fire voice at full gain for shots 1-3 and -1.5 dB from shot 4, resetting after a .25 s gap', () => {
    const r = rig(), gains: number[] = [];
    r.audio = (kind, _pan, gain) => { if (kind === 'fire') gains.push(gain); };
    pressFire(r.s, 'click'); step(r, 60);
    expect(gains.length).toBeGreaterThanOrEqual(9);
    expect(gains.slice(0, 3)).toEqual([1, 1, 1]); expect(gains.slice(3).every(g => g === SHOT_GAIN_LATE)).toBe(true);
    expect(SHOT_GAIN_LATE).toBeCloseTo(10 ** (-1.5 / 20), 4);
    releaseFire(r.s, 'click'); step(r, 30); gains.length = 0;
    tapShot(r.s); step(r, 8); tapShot(r.s); step(r, 8); tapShot(r.s); step(r, 8); tapShot(r.s); step(r);
    expect(gains).toEqual([1, 1, 1, SHOT_GAIN_LATE]);
  });
  it('keeps the step modules pure, landing-safe and under 200 lines', () => {
    for (const file of ['src/game/shooterStep.ts', 'src/game/shooterShots.ts']) {
      const src = readFileSync(file, 'utf8');
      for (const m of ["from 'three'", '@react-three', "from '@dimforge", 'Math.random(', 'WebGLRenderer', 'isVector3', 'BufferGeometry', 'powerHero', 'bankLeft']) expect(src).not.toContain(m);
      expect(src.split('\n').length).toBeLessThan(200);
    }
  });
  it('does not grow the event ring or targets and keeps the drone context object over 600 frames', () => {
    const r = rig({ x: 0, y: 0, z: -1 }, { x: 0, y: 30, z: 60 }), ctx = droneContext, events = r.s.events, targets = r.s.targets;
    r.s.drones.count = 5; pressFire(r.s, 'click'); pressAim(r.s, false);
    for (let i = 0; i < 600; i++) { if (i % 120 === 0) r.s.weapon.heat = 0; step(r); }
    expect(r.s.stats.shots).toBeGreaterThan(20);
    expect(r.s.events).toBe(events); expect(events.length).toBe(16); expect(r.s.targets).toBe(targets); expect(targets.length).toBe(8);
    expect(droneContext).toBe(ctx);
  });
});
