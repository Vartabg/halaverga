import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createShooter, forwardOf, pressFire, type DroneTarget, type ShooterState, type Vec3 } from '../src/game/combat';
import { advanceWeapon } from '../src/game/weapon';
import { clearGesture, gesture } from '../src/game/gesture/bus';
import { createAimFrame, createDroneTrack, pointAt, project, recordTrack, sphereRadiusPx, unproject,
  type DroneTrack } from '../src/game/gesture/screenRay';
import { lastPick, pick, rEff } from '../src/game/gesture/tapBlast';
import { createLasso, lassoBegin, lassoClose, lassoSample } from '../src/game/gesture/lasso';
import { aimed, holdAimed, lockBurst, queueAimedBurst, resetAimed, shotDirOf, trackAimed } from '../src/game/gesture/aimedShot';
import { R_EFF_MIN, R_EFF_PAD } from '../src/game/gesture/tuning';
import { createHarness, loadAssets, type Harness } from './blaster-harness';

const W = 393, H = 852;
function frame(yaw = 0, pitch = 0, left = 0, top = 0) {
  const f = createAimFrame(), d = forwardOf(yaw, pitch, f.dir), r = f.right, u = f.up;
  r.x = Math.cos(yaw); r.y = 0; r.z = -Math.sin(yaw);
  u.x = r.y * d.z - r.z * d.y; u.y = r.z * d.x - r.x * d.z; u.z = r.x * d.y - r.y * d.x;
  f.fov = 65; f.width = W; f.height = H; f.aspect = W / H; f.left = left; f.top = top;
  return f;
}
const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });
/** Targets with drone i placed on the ray through screen (x, y) at view depth d (m). */
function place(targets: DroneTarget[], f: ReturnType<typeof frame>, i: number, x: number, y: number, d: number) {
  const g = targets[i]; pointAt(f, x, y, d, g.c); g.alive = true; g.los = true;
}
function world(n: number) {
  const s = createShooter(); s.drones.count = n;
  return s;
}

describe('screenRay', () => {
  it('project and unproject round-trip within 0.5 px', () => {
    for (const f of [frame(), frame(.7, .3, 10, 20), frame(-2.4, -.9)]) {
      const p = v(), q = { x: 0, y: 0 }, dir = v();
      for (const [x, y] of [[0, 0], [W, H], [W / 2, H / 2], [37, 801], [380, 12]]) {
        const px = x + f.left, py = y + f.top;
        for (const d of [2, 30, 240]) {
          pointAt(f, px, py, d, p);
          expect(project(f, p, q)).toBe(true);
          expect(Math.hypot(q.x - px, q.y - py)).toBeLessThan(.5);
        }
        unproject(f, px, py, dir);
        expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 9);
        p.x = f.origin.x + dir.x * 50; p.y = f.origin.y + dir.y * 50; p.z = f.origin.z + dir.z * 50;
        project(f, p, q);
        expect(Math.hypot(q.x - px, q.y - py)).toBeLessThan(.5);
      }
      p.x = f.origin.x - f.dir.x; p.y = f.origin.y - f.dir.y; p.z = f.origin.z - f.dir.z;
      expect(project(f, p, q)).toBe(false);
    }
  });
});

describe('tapBlast.pick', () => {
  const f = frame(), cx = W / 2, cy = H / 2;
  let s: ShooterState, tr: DroneTrack;
  beforeEach(() => { s = world(2); tr = createDroneTrack(); });
  it('uses R_eff = max(silhouette + 18, 28) and picks the smallest d / R_eff', () => {
    place(s.targets, f, 0, cx, cy, 100);
    recordTrack(tr, f, s.targets, 1, 1000);
    expect(sphereRadiusPx(f, s.targets[0].c, s.targets[0].r) + R_EFF_PAD).toBeLessThan(R_EFF_MIN);
    expect(pick(cx + 27, cy, 1000, s.targets, 1, tr)).toBe(0);
    expect(pick(cx + 29, cy, 1000, s.targets, 1, tr)).toBe(-1);
    place(s.targets, f, 0, cx, cy, 10);
    recordTrack(tr, f, s.targets, 1, 1016);
    const R = rEff(sphereRadiusPx(f, s.targets[0].c, s.targets[0].r));
    expect(R).toBeGreaterThan(R_EFF_MIN + 20);
    expect(pick(cx, cy + R - 1, 1016, s.targets, 1, tr)).toBe(0);
    expect(pick(cx, cy + R + 1, 1016, s.targets, 1, tr)).toBe(-1);
    // Far drone A (R 28) at +0 px and near drone B (R ~78) at +40 px: a tap at +15 is .54 of A's radius but .32 of B's.
    place(s.targets, f, 0, cx, cy, 100); place(s.targets, f, 1, cx + 40, cy, 10);
    recordTrack(tr, f, s.targets, 2, 1032);
    expect(pick(cx + 15, cy, 1032, s.targets, 2, tr)).toBe(1);
    expect(pick(cx - 5, cy, 1032, s.targets, 2, tr)).toBe(0);
  });
  it('ignores dead and out-of-sight drones', () => {
    place(s.targets, f, 0, cx, cy, 30);
    recordTrack(tr, f, s.targets, 1, 1000);
    expect(pick(cx, cy, 1000, s.targets, 1, tr)).toBe(0);
    s.targets[0].alive = false;
    expect(pick(cx, cy, 1000, s.targets, 1, tr)).toBe(-1);
    s.targets[0].alive = true; s.targets[0].los = false;
    expect(pick(cx, cy, 1000, s.targets, 1, tr)).toBe(-1);
  });
  it('the 80 ms ghost catches a tap that trails a moving drone', () => {
    const x = (t: number) => 100 + .6 * t;   // 0.6 px/ms across the screen at 100 m (R_eff 28)
    for (let t = 0; t <= 320; t += 16) { place(s.targets, f, 0, x(t), cy, 100); recordTrack(tr, f, s.targets, 1, t); }
    expect(pick(x(240), cy, 320, s.targets, 1, tr)).toBe(0);
    expect(lastPick.ghost).toBe(true);
    expect(pick(x(160), cy, 320, s.targets, 1, tr)).toBe(-1);
    expect(pick(x(320) + 5, cy, 320, s.targets, 1, tr)).toBe(0);
    expect(lastPick.ghost).toBe(false);
  });
});

describe('lasso', () => {
  const f = frame(), L = createLasso();
  /** A loop of radius r around centre(t), sampled every 8 ms, the track recorded every 16 ms from move(t). */
  function stroke(s: ShooterState, n: number, centre: (t: number) => [number, number], r: number, move: (t: number) => void, deg = 380) {
    const tr = createDroneTrack(), steps = 48;
    lassoBegin(L);
    for (let k = 0; k <= steps; k++) {
      const t = k * 8;
      if (k % 2 === 0) { move(t); recordTrack(tr, f, s.targets, n, t); }
      const a = deg * Math.PI / 180 * k / steps, [x, y] = centre(t);
      lassoSample(L, x + r * Math.cos(a), y + r * Math.sin(a), t, s.targets, n, tr);
    }
    return tr;
  }
  it('locks a drone that translates 60 px during the stroke; a static point there does not', () => {
    const s = world(2), dx = (t: number) => 60 * t / 384;
    // A 30 px loop drawn around the drone while it drifts 60 px: around its start point the stroke does not wind at all.
    stroke(s, 2, t => [150 + dx(t), 400], 30, t => { place(s.targets, f, 0, 150 + dx(t), 400, 40); place(s.targets, f, 1, 150, 400, 60); }, 360);
    expect(Math.abs(L.winding[0])).toBeGreaterThanOrEqual(300);
    expect(Array.from(L.locks.slice(0, L.count))).toEqual([0]);
    expect(Math.abs(L.winding[1])).toBeLessThan(300);
    expect(lassoClose(L, false)).toBe(1);
  });
  it('a loop around 2 of 4 drones locks exactly 2; around all 4 it caps at 3', () => {
    const s = world(4), at = [[100, 300], [160, 300], [300, 600], [60, 700]];
    const still = () => at.forEach(([x, y], i) => place(s.targets, f, i, x, y, 50));
    stroke(s, 4, () => [130, 300], 70, still);
    expect(lassoClose(L, true)).toBe(2);
    expect(Array.from(L.locks.slice(0, 2)).sort()).toEqual([0, 1]);
    at.splice(0, 4, [150, 400], [240, 400], [196, 470], [196, 380]);
    stroke(s, 4, () => [196, 426], 150, still);
    expect(L.count).toBe(3);
    expect(lassoClose(L, true)).toBe(3);
  });
  it('a closed stroke also locks a drone within 12 px of its edge', () => {
    const s = world(2);
    stroke(s, 2, () => [200, 400], 60, () => { place(s.targets, f, 0, 200 + 68, 400, 50); place(s.targets, f, 1, 200 + 90, 400, 50); }, 360);
    expect(L.count).toBe(0);
    expect(lassoClose(L, true)).toBe(1);
    expect(L.locks[0]).toBe(0);
  });
});

describe('aimedShot through the blaster harness', () => {
  let assets: Awaited<ReturnType<typeof loadAssets>>;
  beforeAll(async () => { assets = await loadAssets(); }, 60000);
  beforeEach(() => { resetAimed(); clearGesture(); });
  /** Frames in the order U9 wires them: trackAimed, then the shooter step (advanceWeapon inside). */
  const run = (h: Harness, frames: number) => { for (let i = 0; i < frames; i++) { trackAimed(h.s); h.step(); } };
  const dir = { x: 0, y: 0, z: -1 };
  it.each([30, 60, 120])('a burst fires exactly 3 shots at %i Hz with a stale tapFireUntil and the tap source idle', hz => {
    const h = createHarness(assets, 'hover', hz), s = h.s, shots = s.weapon.shots;
    s.input.tapFireUntil = 0;
    queueAimedBurst(s, dir, -1);
    expect(gesture.facing).toBe(2);
    run(h, hz);
    expect(s.weapon.shots - shots).toBe(3);
    expect(s.input.fire).toBe(false); expect(s.input.fireSource).toBe('none');
    expect(aimed.active).toBe(false); expect(gesture.facing).toBe(0);
  }, 60000);
  it('a TapControls press mid-burst ends the burst with no stuck fire', () => {
    const h = createHarness(assets, 'hover'), s = h.s, shots = s.weapon.shots;
    queueAimedBurst(s, dir, -1);
    while (s.weapon.shots === shots) run(h, 1);
    s.input.tapFireUntil = s.clock + .1; pressFire(s, 'tap');
    run(h, 2);
    expect(aimed.active).toBe(false);
    run(h, 30);
    expect(s.input.fire).toBe(false); expect(s.input.fireSource).toBe('none');
  }, 60000);
  it('overheat truncates the burst and releases the trigger', () => {
    const h = createHarness(assets, 'hover'), s = h.s, shots = s.weapon.shots;
    s.weapon.heat = 92;   // 92 + 4.5 + 4.5 >= 100: the second shot overheats
    queueAimedBurst(s, dir, -1);
    run(h, 60);
    expect(s.weapon.shots - shots).toBe(2);
    expect(s.weapon.lock).toBeGreaterThan(0);
    expect(s.input.fire).toBe(false); expect(s.input.fireSource).toBe('none'); expect(aimed.active).toBe(false);
  }, 60000);
  it('sustained fire runs while held and stops on release', () => {
    const h = createHarness(assets, 'hover'), s = h.s, shots = s.weapon.shots;
    holdAimed(s, dir, -1);
    run(h, 30);
    const held = s.weapon.shots - shots;
    expect(held).toBeGreaterThanOrEqual(4);
    holdAimed(s, dir, -1, true);
    run(h, 1);
    const after = s.weapon.shots;
    expect(s.input.fire).toBe(false);
    run(h, 30);
    expect(s.weapon.shots).toBe(after); expect(after - shots - held).toBeLessThanOrEqual(1);
    expect(aimed.active).toBe(false);
  }, 60000);
});

describe('aimedShot (pure)', () => {
  beforeEach(() => { resetAimed(); clearGesture(); });
  const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / Math.hypot(a.x, a.y, a.z) / Math.hypot(b.x, b.y, b.z)));
  function drones(s: ShooterState) {
    [[-10, 2, -30], [0, 5, -40], [12, -1, -25], [3, 3, -20]].forEach(([x, y, z], i) => {
      const g = s.targets[i]; g.c.x = x; g.c.y = y; g.c.z = z; g.eye.x = x; g.eye.y = y; g.eye.z = z - .72; g.alive = true; g.los = true;
    });
  }
  const releaseByTap = (s: ShooterState) => pressFire(s, 'tap');
  it('shotDirOf falls back to aim.dir', () => {
    const s = world(0);
    expect(shotDirOf(s)).toBe(s.aim.dir);
    queueAimedBurst(s, { x: 3, y: 0, z: -4 }, -1);
    expect(shotDirOf(s)).toEqual({ x: .6, y: 0, z: -.8 });
    releaseByTap(s);
    expect(trackAimed(s)).toBe(false);
    expect(shotDirOf(s)).toBe(s.aim.dir);
  });
  it('aims at the eye when it faces the camera, else the centre', () => {
    const s = world(4); drones(s);
    queueAimedBurst(s, s.aim.dir, 0);
    expect(angle(shotDirOf(s), s.targets[0].c)).toBeLessThan(1e-6);
    const g = s.targets[0]; g.eye.z = g.c.z + .72;   // now facing the camera at the origin
    trackAimed(s);
    expect(angle(shotDirOf(s), g.eye)).toBeLessThan(1e-6);
  });
  it('lockBurst gives 3 shots per drone, in order, and marks dwell only after release', () => {
    const s = world(4), dt = 1 / 60, order: number[] = [], dirs: Vec3[] = [];
    drones(s); s.targets[3].alive = false;
    expect(lockBurst(s, [0, 3, 1, 2])).toBe(3);
    for (let i = 0; i < 120; i++) {
      trackAimed(s);
      const n = advanceWeapon(s.weapon, s.input.fire, s.input.pressSerial, dt);
      for (let k = 0; k < n; k++) { order.push(aimed.drone); dirs.push({ ...shotDirOf(s) }); }
      if (order.length > 0 && order.length < 9) expect(s.drones.dwell[0] + s.drones.dwell[1] + s.drones.dwell[2]).toBe(0);
      s.clock += dt;
    }
    expect(order).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    dirs.forEach((d, k) => expect(angle(d, s.targets[order[k]].c)).toBeLessThan(1e-6));
    expect(s.input.fire).toBe(false); expect(aimed.active).toBe(false);
    for (const i of [0, 1, 2]) expect(s.drones.dwell[i]).toBeGreaterThan(.2);
    expect(s.drones.dwell[3]).toBe(0);
  });
});
