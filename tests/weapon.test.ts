import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEAT, createShooter, type WeaponState } from '../src/game/combat';
import { WEAPON, advanceSpread, advanceWeapon, bloom01, heat01, locked, moveTarget, spreadHalfAngle } from '../src/game/weapon';

const RATES = [30, 60, 120, 165];
const P = 1 / 9, DEG = Math.PI / 180;
type Rig = { w: WeaponState; held: boolean; serial: number; t: number; shotTimes: number[]; overheats: number; vents: number };
const rig = (): Rig => ({ w: createShooter().weapon, held: false, serial: 0, t: 0, shotTimes: [], overheats: 0, vents: 0 });
function frame(r: Rig, dt: number) {
  r.t += dt;
  const n = advanceWeapon(r.w, r.held, r.serial, dt);
  for (let k = 0; k < n; k++) r.shotTimes.push(r.t);
  if (r.w.justOverheated) r.overheats++;
  if (r.w.justVented) r.vents++;
  return n;
}
const run = (r: Rig, dt: number, seconds: number) => { for (let i = Math.round(seconds / dt); i > 0; i--) frame(r, dt); };
function until(r: Rig, dt: number, done: (w: WeaponState) => boolean) {
  for (let i = 0; i < 10000 && !done(r.w); i++) frame(r, dt);
  expect(done(r.w)).toBe(true);
}
/** Holds fire from a fresh weapon until it overheats (shot 23). */
function overheat(r: Rig, dt: number) { r.held = true; r.serial++; until(r, dt, w => locked(w)); }
const finiteState = (w: WeaponState) => Object.entries(w).every(([, v]) => typeof v !== 'number' || !Number.isNaN(v));

describe('weapon clock', () => {
  it.each(RATES)('fires 19 shots in 2.0 s of held fire at %i Hz, one every 1/9 s from t = 0', hz => {
    const r = rig(), dt = 1 / hz;
    r.held = true; r.serial = 1; run(r, dt, 2);
    expect(r.shotTimes).toHaveLength(19);
    r.shotTimes.forEach((t, k) => { expect(t).toBeGreaterThanOrEqual(k * P - 1e-9); expect(t).toBeLessThan(k * P + dt + 1e-9); });
    expect(r.overheats).toBe(0); expect(heat01(r.w)).toBeCloseTo(19 * 4.5 / 100, 9);
  });
  it.each(RATES)('overheats on shot 23 at 22/9 s at %i Hz and fires nothing more in 3 s', hz => {
    const r = rig(), dt = 1 / hz;
    r.held = true; r.serial = 1;
    for (let i = Math.round(3 / dt); i > 0; i--) { frame(r, dt); if (r.w.justOverheated) expect(r.shotTimes).toHaveLength(23); }
    expect(r.shotTimes).toHaveLength(23); expect(r.overheats).toBe(1); expect(r.w.shots).toBe(23);
    expect(r.shotTimes[22]).toBeGreaterThanOrEqual(22 * P - 1e-9); expect(r.shotTimes[22]).toBeLessThan(22 * P + dt);
    expect(locked(r.w)).toBe(true);
  });
  it('fires exactly one shot for a press and release inside one frame', () => {
    const r = rig();
    r.serial++; expect(frame(r, 1 / 60)).toBe(1);
    run(r, 1 / 60, 1); expect(r.shotTimes).toHaveLength(1);
  });
  it.each(RATES)('buffers a second press 50 ms after the first until the period elapses at %i Hz', hz => {
    const r = rig(), dt = 1 / hz;
    r.serial++; frame(r, dt);
    until(r, dt, () => r.t >= .05 + dt / 2);
    r.serial++; const [t0] = r.shotTimes;
    run(r, dt, .5);
    expect(r.shotTimes).toHaveLength(2);
    expect(r.shotTimes[1] - t0).toBeGreaterThanOrEqual(P - 1e-9); expect(r.shotTimes[1] - t0).toBeLessThan(P + dt + 1e-9);
  });
  it('never fires faster than 9/s however fast the presses come, and caps each call at 3', () => {
    const r = rig(), dt = 1 / 165;
    for (let i = 0; i < 330; i++) { r.serial++; frame(r, dt); }
    for (let k = 1; k < r.shotTimes.length; k++) expect(r.shotTimes[k] - r.shotTimes[k - 1]).toBeGreaterThanOrEqual(P - 1e-9);
    expect(r.shotTimes.length).toBeLessThanOrEqual(19);
    const w = createShooter().weapon; w.acc = 10;
    expect(advanceWeapon(w, true, 0, .05)).toBe(3);
    const hot = createShooter().weapon; hot.acc = 10; hot.heat = 96;
    expect(advanceWeapon(hot, true, 0, .05)).toBe(1); expect(locked(hot)).toBe(true); expect(hot.acc).toBe(0); expect(hot.justOverheated).toBe(true);
  });
});

describe('weapon lockout', () => {
  it('locks for 1.6 s while heat drains linearly to 0, and a queued press does not fire after it', () => {
    const r = rig(), dt = 1 / 64;
    overheat(r, dt); r.held = false;
    expect(r.w.heat).toBe(HEAT.max);
    r.serial++; frame(r, dt); expect(r.w.pending).toBe(false);
    for (let i = 1; i < 51; i++) frame(r, dt);
    expect(r.w.heat).toBeCloseTo(100 * (1 - 51 / 64 / 1.6), 9); expect(r.w.heat).toBeCloseTo(50, 0); expect(locked(r.w)).toBe(true);
    const shots = r.w.shots;
    for (let i = 0; i < 51; i++) frame(r, dt);
    expect(r.w.lockT).toBeCloseTo(102 / 64, 9); expect(locked(r.w)).toBe(true); expect(r.w.heat).toBeCloseTo(100 * (1 - 102 / 64 / 1.6), 6);
    frame(r, dt);
    expect(locked(r.w)).toBe(false); expect(r.w.heat).toBe(0); expect(r.w.shots).toBe(shots);
  });
  it.each(RATES)('a press at lockT 0.8 vents heat and held firing resumes after one period at %i Hz', hz => {
    const r = rig(), dt = 1 / hz;
    overheat(r, dt);
    until(r, dt, w => w.lockT >= HEAT.ventAt - dt / 2);
    r.serial++; frame(r, dt);
    expect(r.vents).toBe(1); expect(r.w.justVented).toBe(true); expect(r.w.heat).toBe(0); expect(locked(r.w)).toBe(false);
    const tv = r.t, before = r.shotTimes.length;
    frame(r, dt); expect(r.w.justVented).toBe(false);
    run(r, dt, .5);
    expect(r.shotTimes.length - before).toBe(Math.floor((r.t - tv + dt) / P + 1e-6));
    expect(r.shotTimes[before] - tv).toBeGreaterThanOrEqual(P - dt - 1e-9); expect(r.shotTimes[before] - tv).toBeLessThan(P + dt);
  });
  it.each([.6, 1])('a press at lockT %f does nothing and is not queued', at => {
    const r = rig(), dt = 1 / 120;
    overheat(r, dt); r.held = false;
    until(r, dt, w => w.lockT >= at - dt / 2);
    const heat = r.w.heat, shots = r.w.shots;
    r.serial++; frame(r, dt);
    expect(r.vents).toBe(0); expect(locked(r.w)).toBe(true); expect(r.w.heat).toBeLessThan(heat); expect(r.w.pending).toBe(false);
    run(r, dt, 1.2);
    expect(locked(r.w)).toBe(false); expect(r.w.shots).toBe(shots); expect(r.w.heat).toBe(0);
  });
  it.each(RATES)('holding through the end of the lock resumes firing without a re-press at %i Hz', hz => {
    const r = rig(), dt = 1 / hz;
    overheat(r, dt);
    const t0 = r.t;
    until(r, dt, w => !locked(w));
    expect(r.t - t0).toBeGreaterThanOrEqual(HEAT.lock - 1e-9); expect(r.t - t0).toBeLessThan(HEAT.lock + dt);
    const tu = r.t, before = r.shotTimes.length;
    run(r, dt, 1);
    expect(r.shotTimes.length - before).toBe(9);
    expect(r.shotTimes[before] - tu).toBeGreaterThanOrEqual(P - dt - 1e-9); expect(r.shotTimes[before] - tu).toBeLessThan(P + dt);
  });
});

describe('weapon cooling and spread', () => {
  it('cools heat at 60/s once 0.3 s have passed since the last shot', () => {
    const r = rig(), dt = 1 / 64;
    r.serial++; frame(r, dt); r.w.heat = 50;
    for (let i = 0; i < 19; i++) frame(r, dt);
    expect(r.w.sinceShot).toBe(19 / 64); expect(r.w.heat).toBe(50);
    frame(r, dt); expect(r.w.heat).toBeCloseTo(50 - 60 / 64, 9);
    for (let i = 0; i < 20; i++) frame(r, dt);
    expect(r.w.heat).toBeCloseTo(50 - 21 * 60 / 64, 9);
    run(r, dt, 2); expect(r.w.heat).toBe(0);
  });
  it('recovers spreadHeat at 12/s once 0.15 s have passed', () => {
    const r = rig(), dt = 1 / 64;
    r.serial++; frame(r, dt); expect(bloom01(r.w)).toBeCloseTo(.1, 9); r.w.spreadHeat = 8;
    for (let i = 0; i < 9; i++) frame(r, dt);
    expect(r.w.spreadHeat).toBe(8);
    frame(r, dt); expect(r.w.spreadHeat).toBeCloseTo(8 - 12 / 64, 9);
    for (let i = 0; i < 10; i++) frame(r, dt);
    expect(r.w.spreadHeat).toBeCloseTo(8 - 11 * 12 / 64, 9);
    run(r, dt, 1); expect(r.w.spreadHeat).toBe(0);
  });
  it('caps spreadHeat at spreadHeatMax during sustained fire', () => {
    const r = rig(); r.held = true; r.serial++; run(r, 1 / 60, 2);
    expect(r.w.spreadHeat).toBe(WEAPON.spreadHeatMax); expect(bloom01(r.w)).toBe(1);
  });
  it('spreadHalfAngle gives first-shot accuracy, hip bloom and the ADS multiplier', () => {
    const w = createShooter().weapon;
    w.sinceShot = .25; expect(spreadHalfAngle(w, 1, 0)).toBe(0);
    w.sinceShot = .24; expect(spreadHalfAngle(w, 1, 0)).toBeCloseTo(.8 * .4 / 2 * DEG, 12);
    w.sinceShot = 1; expect(spreadHalfAngle(w, 1, 2)).toBeCloseTo(.8 * .4 / 2 * DEG, 12);
    expect(spreadHalfAngle(w, 0, 5)).toBeCloseTo(.4 * DEG, 12);
    expect(spreadHalfAngle(w, 1, 5) / spreadHalfAngle(w, 0, 5)).toBeCloseTo(.4, 12);
    w.spreadHeat = 10; expect(spreadHalfAngle(w, 0, 5)).toBeCloseTo(2 * DEG, 12);
    w.spreadHeat = 5; w.moveMul = 1.8; expect(spreadHalfAngle(w, 0, 5)).toBeCloseTo(2.4 / 2 * 1.8 * DEG, 12);
  });
  it('moveMul targets .7 still, 1 cruising and 1.8 at 34 m/s, and settles exactly', () => {
    expect([0, 1.5, 2.25, 3, 8, 13, 23.5, 34, 60].map(moveTarget)).toEqual([.7, .7, .85, 1, 1, 1, 1.4, 1.8, 1.8]);
    const w = createShooter().weapon;
    advanceSpread(w, 0, 34, .05); expect(w.moveMul).toBeCloseTo(1 + .8 * (1 - Math.exp(-.25)), 12);
    for (let i = 0; i < 200; i++) advanceSpread(w, 0, 34, 1 / 60);
    expect(w.moveMul).toBe(1.8);
    for (let i = 0; i < 200; i++) advanceSpread(w, 1, 0, 1 / 60);
    expect(w.moveMul).toBe(.7);
    const a = createShooter().weapon, b = createShooter().weapon;
    for (let i = 0; i < 30; i++) advanceSpread(a, 0, 34, 1 / 30);
    for (let i = 0; i < 165; i++) advanceSpread(b, 0, 34, 1 / 165);
    expect(a.moveMul).toBeCloseTo(b.moveMul, 9);
  });
});

describe('weapon safety', () => {
  it('treats dt <= 0, NaN and Infinity as zero time: no shots and no NaN state', () => {
    const bad = [0, -1, -1e9, NaN, Infinity, -Infinity];
    const w = createShooter().weapon;
    for (let i = 0; i < 20; i++) for (const dt of bad) expect(advanceWeapon(w, true, 0, dt)).toBe(0);
    expect(w.acc).toBe(0); expect(finiteState(w)).toBe(true);
    expect(advanceWeapon(w, true, 1, 1 / 60)).toBe(1);
    for (let i = 0; i < 20; i++) for (const dt of bad) expect(advanceWeapon(w, true, 1, dt)).toBe(0);
    expect(w.sinceShot).toBe(0); expect(w.heat).toBe(4.5); expect(finiteState(w)).toBe(true);
    w.moveMul = 1;
    for (const dt of bad) advanceSpread(w, NaN, NaN, dt);
    expect(w.moveMul).toBe(1);
    for (const v of [NaN, Infinity, -Infinity]) { advanceSpread(w, v, v, 1 / 60); expect(Number.isFinite(spreadHalfAngle(w, v, v))).toBe(true); }
    expect(finiteState(w)).toBe(true);
  });
  it('stays landing-safe: imports only ./combat and never calls Math.random', () => {
    const src = readFileSync(new URL('../src/game/weapon.ts', import.meta.url), 'utf8');
    expect([...src.matchAll(/from '([^']+)'/g)].map(m => m[1])).toEqual(['./combat']);
    for (const s of ['Math.random(', 'WebGLRenderer', 'isVector3', '@react-three', 'BufferGeometry', 'powerHero', 'bankLeft'])
      expect(src.includes(s)).toBe(false);
    expect(src.split('\n').length).toBeLessThan(200);
  });
});
