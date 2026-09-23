import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DRONE_RADIUS, HIP_HOLD, PHASE, createShooter, engaged, frictionNow, lookGain, moveMode, pressFire, releaseFire,
  resetShooterFeel, resetShooterInput, tapShot, threat, type LookSource, type ShooterState, type Vec3 } from '../src/game/combat';
import { AUTO_FIRE, autoFire, autoFireTarget, resetAutoFire, stepAutoFire } from '../src/game/autoFire';
import { advanceAssist, createAssistMemory } from '../src/game/aimAssist';
import { createDroneSim, type DroneSim } from '../src/game/drones';
import { createStepContext, droneContext, stepShooter, type StepContext } from '../src/game/shooterStep';
import { resetBurst } from '../src/game/burst';

let s: ShooterState = createShooter();
afterEach(() => { resetAutoFire(s, autoFire); resetBurst(); });
const EPS = 1e-9;
/** Synthetic state: camera ray published, a target acquired, steering by touch, weapon unlocked. */
function fresh() {
  s = createShooter(); s.aim.valid = true; s.aim.acquired = true; s.input.lookSource = 'touch'; s.weapon.lock = 0;
  resetAutoFire(s, autoFire); return s;
}
const run = (dt: number, frames: number, enabled = true) => { for (let k = 0; k < frames; k++) stepAutoFire(s, autoFire, enabled, dt); };
/** Steps until auto-fire presses (or `limit` s pass); returns the accumulated time at the press frame, or Infinity. */
function untilPress(dt: number, limit = 1) {
  const serial = s.input.pressSerial;
  for (let t = 0, k = 1; t < limit; k++) { t = k * dt; stepAutoFire(s, autoFire, true, dt); if (s.input.pressSerial !== serial) return t; }
  return Infinity;
}
const hold = (dt = 1 / 60) => { fresh(); const t = untilPress(dt); expect(t).toBeLessThan(Infinity); return t; };

describe('auto-fire dwell', () => {
  it.each([30, 60, 120, 165])('presses once, on the first frame at or past 100 ms, at %i Hz', hz => {
    fresh(); const dt = 1 / hz;
    let t = 0, pressedAt = Infinity;
    for (let k = 1; k <= hz; k++) {
      stepAutoFire(s, autoFire, true, dt); t = k * dt;
      if (pressedAt === Infinity && s.input.pressSerial === 1) pressedAt = t;
      if (t < AUTO_FIRE.dwell - EPS) expect([hz, k, s.input.pressSerial, s.input.fire]).toEqual([hz, k, 0, false]);
    }
    expect(s.input.pressSerial).toBe(1);
    expect(s.input.fire).toBe(true); expect(s.input.fireSource).toBe('touch'); expect(s.input.auto).toBe(true);
    expect(pressedAt).toBeGreaterThanOrEqual(AUTO_FIRE.dwell - EPS); expect(pressedAt).toBeLessThan(AUTO_FIRE.dwell + dt + EPS);
    expect(autoFire.holding).toBe(true);
  });
  it('never presses without a published camera ray', () => {
    fresh(); s.aim.valid = false; run(1 / 60, 120); expect(s.input.pressSerial).toBe(0);
    expect(autoFireTarget(s)).toBe(false);
  });
});

describe('auto-fire grace', () => {
  it('keeps the hold through 120 ms of lost acquisition and releases within a frame of 150 ms', () => {
    const dt = 1 / 60; hold(dt); const serial = s.input.pressSerial;
    s.aim.acquired = false; run(dt, 7); // 117 ms
    s.aim.acquired = true; run(dt, 1);
    expect(s.input.fire).toBe(true); expect(autoFire.holding).toBe(true); expect(s.input.pressSerial).toBe(serial);
    s.aim.acquired = false;
    let t = 0;
    for (let k = 1; s.input.fire && k < 60; k++) { stepAutoFire(s, autoFire, true, dt); t = k * dt; }
    expect(s.input.fire).toBe(false); expect(s.input.fireSource).toBe('none'); expect(autoFire.holding).toBe(false);
    expect(t).toBeGreaterThanOrEqual(AUTO_FIRE.grace - EPS); expect(t).toBeLessThan(AUTO_FIRE.grace + dt + EPS);
    // The trailing window stays auto-fire's: it never caps speed.
    expect(s.input.auto).toBe(true);
    s.aim.acquired = true; const at = untilPress(dt);
    expect(at).toBeGreaterThanOrEqual(AUTO_FIRE.dwell - EPS); expect(at).toBeLessThan(AUTO_FIRE.dwell + dt + EPS);
    expect(s.input.pressSerial).toBe(serial + 1);
  });
});

describe('auto-fire overheat', () => {
  it('releases on the lock step, never presses during the lock, and needs a fresh dwell after it', () => {
    const dt = 1 / 60; hold(dt); const serial = s.input.pressSerial;
    s.weapon.lock = 1.6; run(dt, 1);
    expect(s.input.fire).toBe(false); expect(autoFire.holding).toBe(false);
    for (let k = 0; k < 96; k++) { stepAutoFire(s, autoFire, true, dt); expect(s.input.pressSerial).toBe(serial); }
    s.weapon.lock = 0;
    const at = untilPress(dt);
    expect(at).toBeGreaterThanOrEqual(AUTO_FIRE.dwell - EPS); expect(s.input.pressSerial).toBe(serial + 1);
  });
});

describe('auto-fire gating', () => {
  it('never presses while disabled or steered by trackpad, mouse or the tap pad, and drops its hold on the same step', () => {
    fresh(); run(1 / 60, 60, false); expect(s.input.pressSerial).toBe(0);
    for (const src of ['trackpad', 'mouse', 'tap'] as LookSource[]) {
      fresh(); s.input.lookSource = src; run(1 / 60, 60); expect([src, s.input.pressSerial]).toEqual([src, 0]);
    }
    hold(); run(1 / 60, 1, false); expect(s.input.fire).toBe(false); expect(autoFire.holding).toBe(false);
    for (const src of ['trackpad', 'mouse', 'tap'] as LookSource[]) {
      hold(); s.input.lookSource = src; run(1 / 60, 1);
      expect([src, s.input.fire, autoFire.holding]).toEqual([src, false, false]);
    }
  });
  it('never presses or releases a hold another source owns', () => {
    for (const src of ['tap', 'keys', 'click'] as const) {
      fresh(); pressFire(s, src); const serial = s.input.pressSerial;
      run(1 / 60, 60); expect([src, s.input.pressSerial, s.input.fire, s.input.fireSource]).toEqual([src, serial, true, src]);
      s.aim.acquired = false; run(1 / 60, 60); expect([src, s.input.fire, s.input.fireSource]).toEqual([src, true, src]);
    }
  });
  it('hands over to C: a manual press clears auto, and after its release auto-fire needs a new dwell', () => {
    const dt = 1 / 60; hold(dt);
    pressFire(s, 'keys'); expect(s.input.auto).toBe(false);
    run(dt, 1); expect(autoFire.holding).toBe(false);
    const serial = s.input.pressSerial; run(dt, 30); expect(s.input.pressSerial).toBe(serial); expect(s.input.fireSource).toBe('keys');
    releaseFire(s, 'keys');
    const at = untilPress(dt);
    expect(at).toBeGreaterThanOrEqual(AUTO_FIRE.dwell - EPS); expect(s.input.auto).toBe(true); expect(s.input.pressSerial).toBe(serial + 1);
  });
  it('never takes a Fire-button touch hold as its own', () => {
    hold(); pressFire(s, 'touch'); expect(s.input.auto).toBe(false);
    s.aim.acquired = false; run(1 / 60, 60);
    expect(s.input.fire).toBe(true); expect(s.input.fireSource).toBe('touch'); expect(autoFire.holding).toBe(false);
  });
});

describe('auto-fire external reset', () => {
  it('forgets a hold that resetShooterInput dropped and needs a new dwell', () => {
    const dt = 1 / 60; hold(dt); const serial = s.input.pressSerial;
    resetShooterInput(s); run(dt, 1); expect(autoFire.holding).toBe(false); expect(s.input.pressSerial).toBe(serial);
    const at = untilPress(dt); expect(at + dt).toBeGreaterThanOrEqual(AUTO_FIRE.dwell - EPS);
  });
  it('resetAutoFire releases only its own hold', () => {
    hold(); resetAutoFire(s, autoFire); expect(s.input.fire).toBe(false); expect(autoFire).toEqual({ dwell: 0, lost: 0, holding: false });
    fresh(); pressFire(s, 'click'); autoFire.holding = true; resetAutoFire(s, autoFire);
    expect([s.input.fire, s.input.fireSource]).toEqual([true, 'click']);
    fresh(); pressFire(s, 'touch'); autoFire.holding = true; resetAutoFire(s, autoFire);
    expect([s.input.fire, s.input.fireSource]).toEqual([true, 'touch']); expect(autoFire.holding).toBe(false);
  });
});

describe('auto-fire never brakes flight', () => {
  it('keeps normal flight and exact look while it holds and through its trailing window; a manual press restores hip fire', () => {
    hold(); const out = { x: 0, y: 0 };
    expect(moveMode(s)).toBe(0); expect(engaged(s)).toBe(false); expect(threat(s)).toBe(true);
    expect(lookGain(s, .013, -.007, out)).toEqual({ x: .013, y: -.007 });
    s.aim.acquired = false; run(1 / 60, 10); expect(s.input.fire).toBe(false);
    s.weapon.sinceShot = HIP_HOLD / 2; expect(moveMode(s)).toBe(0); expect(engaged(s)).toBe(false); expect(threat(s)).toBe(true);
    pressFire(s, 'keys'); expect(moveMode(s)).toBe(1); expect(engaged(s)).toBe(true);
    s.input.auto = true; tapShot(s); expect(s.input.auto).toBe(false);
    s.input.auto = true; resetShooterFeel(s); expect(s.input.auto).toBe(false);
  });
  it('adds no assist friction for a drone in the zone while auto-fire holds, unlike a manual hold', () => {
    const o: Vec3 = { x: 0, y: 0, z: 0 }, d: Vec3 = { x: 0, y: 0, z: -1 };
    const setup = () => {
      fresh(); s.drones.count = 1; s.drones.phase[0] = PHASE.alert;
      Object.assign(s.targets[0], { alive: true, los: true, r: DRONE_RADIUS }); Object.assign(s.targets[0].c, { x: .3, y: 0, z: -20 });
    };
    setup(); expect(untilPress(1 / 60)).toBeLessThan(Infinity); expect(s.input.auto).toBe(true); // auto-fire's own hold
    const mem = createAssistMemory();
    for (let k = 0; k < 30; k++) advanceAssist(s, mem, o, d, 65, 1, 1 / 60);
    expect(s.aim.acquired).toBe(true); expect(s.assist.engaged).toBe(false); expect(frictionNow(s)).toBe(0);
    setup(); pressFire(s, 'touch'); // a manual Fire-button hold engages the assist as before
    const m2 = createAssistMemory();
    for (let k = 0; k < 30; k++) advanceAssist(s, m2, o, d, 65, 1, 1 / 60);
    expect(s.assist.engaged).toBe(true); expect(frictionNow(s)).toBeGreaterThan(0);
  });
});

// Integration through stepShooter, on the shooter-step rig (one alerted drone with line of sight, a stub world with clear sight lines).
const ORIGIN = { x: 0, y: 30, z: 80 }, AT = { x: 0, y: 30, z: 60 }, DEG = Math.PI / 180;
type Rig = { s: ShooterState; sim: DroneSim; ctx: StepContext };
const world = { castShot: () => false, lineClear: () => true };
const mem = createAssistMemory(), audio = () => {};
function rig(hz: number, src: LookSource = 'touch', auto = true): Rig {
  s = createShooter(); resetAutoFire(s, autoFire);
  const sim = createDroneSim(s), ctx = createStepContext(), f = s.drones;
  f.count = 1; f.phase[0] = PHASE.alert; f.yaw[0] = 0; f.pitch[0] = 0; f.los[0] = 1;
  for (const v of [f.pos[0], f.home[0], f.anchor[0], sim.prev[0]]) Object.assign(v, AT);
  const a = s.aim; a.valid = true; Object.assign(a.origin, ORIGIN); Object.assign(a.right, { x: 1, y: 0, z: 0 }); Object.assign(a.up, { x: 0, y: 1, z: 0 });
  Object.assign(ctx.head, ORIGIN); Object.assign(ctx.player, ORIGIN);
  ctx.dt = 1 / hz; ctx.flying = true; ctx.speed = 25; ctx.autoFire = auto; s.input.lookSource = src;
  return { s, sim, ctx };
}
function aimAt(r: Rig, d: Vec3) { const l = Math.hypot(d.x, d.y, d.z); r.s.aim.dir.x = d.x / l; r.s.aim.dir.y = d.y / l; r.s.aim.dir.z = d.z / l; }
/** Re-aims at the drone where it is drawn (or `off` rad to its side), then steps once. */
function track(r: Rig, off = 0) {
  const p = r.s.drones.pos[0], k = r.s.drones.knock[0], x = p.x + k.x - ORIGIN.x, y = p.y + k.y - ORIGIN.y, z = p.z + k.z - ORIGIN.z;
  const c = Math.cos(off), n = Math.sin(off);
  aimAt(r, { x: x * c - z * n, y: off ? 0 : y, z: x * n + z * c });
  stepShooter(r.s, r.sim, mem, world, r.ctx, audio);
}

describe('auto-fire through stepShooter', () => {
  it.each([60, 120])('fires its first shot 100 ms (plus at most a frame) after the drone is acquired, at %i Hz', hz => {
    const r = rig(hz), dt = 1 / hz;
    let tAcq = -1, tShot = -1, sawThreat = false;
    for (let k = 0; k < 2 * hz && tShot < 0; k++) {
      track(r);
      if (tAcq < 0 && r.s.aim.acquired) tAcq = r.s.clock;
      if (r.s.stats.shots > 0) tShot = r.s.clock;
      if (autoFire.holding) {
        sawThreat ||= droneContext.threat;
        expect(moveMode(r.s)).toBe(0); expect(engaged(r.s)).toBe(false); expect(frictionNow(r.s)).toBe(0);
      }
    }
    expect(tAcq).toBeGreaterThan(0);
    expect(tShot).toBeGreaterThanOrEqual(tAcq + AUTO_FIRE.dwell - EPS); expect(tShot).toBeLessThanOrEqual(tAcq + AUTO_FIRE.dwell + dt + EPS);
    expect(sawThreat).toBe(true); expect(r.s.input.fireSource).toBe('touch'); expect(r.s.input.auto).toBe(true);
  });
  it('fires nothing with the setting off or with a trackpad', () => {
    for (const [src, on] of [['touch', false], ['trackpad', true]] as const) {
      const r = rig(60, src, on);
      for (let k = 0; k < 120; k++) track(r);
      expect([src, on, r.s.stats.shots]).toEqual([src, on, 0]);
    }
  });
  it('fires nothing aimed 20 degrees away, and every feel channel stays exactly 0', () => {
    const r = rig(60);
    for (let k = 0; k < 120; k++) {
      track(r, 20 * DEG);
      expect(r.s.aim.acquired).toBe(false);
      expect([r.s.aim.blend, r.s.aim.fireHold, r.s.assist.slow]).toEqual([0, 0, 0]);
      for (const [key, v] of Object.entries(r.s.camFx)) expect([key, v]).toEqual([key, 0]);
    }
    expect(r.s.stats.shots).toBe(0); expect(r.s.input.pressSerial).toBe(0);
  });
});

describe('auto-fire into cover', () => {
  it('never presses while the muzzle is blocked, and a blocked muzzle releases the hold at once (no grace burst)', () => {
    fresh(); s.aim.blocked = true; run(1 / 60, 60);
    expect(autoFireTarget(s)).toBe(false); expect(s.input.pressSerial).toBe(0);
    s.aim.blocked = false; hold(); expect(autoFire.holding).toBe(true);
    s.aim.blocked = true; run(1 / 60, 1);
    expect(s.input.fire).toBe(false); expect(autoFire.holding).toBe(false); expect(s.input.fireSource).toBe('none');
  });
  // A railing between the cannon and a drone the camera sees: the camera ray is clear, every muzzle segment is not.
  const MUZZLE = { x: .45, y: 29.4, z: 79.6 };
  const covered = (blocked: boolean) => ({
    castShot: (o: Vec3, _d: Vec3, max: number, out: { t: number; normal: Vec3 }) => {
      if (!blocked || o.x !== MUZZLE.x || o.y !== MUZZLE.y || o.z !== MUZZLE.z || max < 1) return false;
      out.t = .6; out.normal.x = 0; out.normal.y = 0; out.normal.z = 1; return true;
    },
    lineClear: () => true,
  });
  function burstInto(blocked: boolean) {
    const r = rig(60), w = covered(blocked), kinds: string[] = [];
    let serial = 0;
    for (let k = 0; k < 120; k++) {
      Object.assign(r.s.muzzle, MUZZLE, { valid: true, weight: 1 });
      const p = r.s.drones.pos[0], x = p.x - ORIGIN.x, y = p.y - ORIGIN.y, z = p.z - ORIGIN.z;
      aimAt(r, { x, y, z }); stepShooter(r.s, r.sim, mem, w, r.ctx, audio);
      for (; serial < r.s.eventSerial; serial++) kinds.push(r.s.events[serial % r.s.events.length].kind);
    }
    return { shots: r.s.stats.shots, blocked: kinds.filter(k => k === 'blocked').length, hits: r.s.stats.hits };
  }
  it('stops auto-firing into a wall the camera cannot see (stepShooter, 2 s at 60 Hz)', () => {
    const clear = burstInto(false), wall = burstInto(true);
    // Clear: it fires until the drone breaks (6 hits). Covered: no hits, and no burst of blocked shots.
    expect(clear.hits).toBeGreaterThanOrEqual(5);
    // One blocked shot per engagement: the next press waits until the arm lowers and the muzzle is re-checked.
    expect(wall.blocked).toBeGreaterThan(0); expect(wall.shots).toBeLessThanOrEqual(2); expect(wall.hits).toBe(0);
  });
});

it('keeps autoFire.ts pure, landing-safe and under 200 lines', () => {
  const src = readFileSync('src/game/autoFire.ts', 'utf8');
  for (const m of ["from 'three'", '@react-three', "from '@dimforge", 'Math.random(', 'WebGLRenderer', 'isVector3', 'BufferGeometry', 'powerHero', 'bankLeft']) expect(src).not.toContain(m);
  expect(src.split('\n').length).toBeLessThan(200);
  expect(readFileSync('src/game/combat.ts', 'utf8').split('\n').length).toBeLessThanOrEqual(200);
});
