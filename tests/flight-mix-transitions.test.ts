import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import type { Vec } from '../src/game/motion';
import { advanceFlightPose } from '../src/game/presentation';
import { advanceSuitAnimation, createSuitAnimation, type AnimationInput } from '../src/world/suitAnimation';
import { LEGACY_COUNT } from '../src/world/suitSkeleton';
import { applySuitPose, orientSuit } from '../src/world/suitPose';
import { applyFlightClips } from '../src/world/flightPose';
import { advanceFlightMix, createFlightMix, cruising, flightPose, frame, quats, rig, type Rig } from './flight-harness';
type Drive = (t: number) => AnimationInput;
/** Runs presentation, animation and mix at `hz` like the game, posing a clips rig and a clips-off rig from the same state each frame. */
type Life = ReturnType<typeof createSuitAnimation>; type Mix = ReturnType<typeof createFlightMix>; type P = ReturnType<typeof flightPose>;
function play(seconds: number, hz: number, drive: Drive, each: (clips: Rig, legacy: Rig, t: number, life: Life, p: P, mix: Mix) => void,
  { yawRate = () => 0 }: { yawRate?: (t: number) => number } = {}) {
  const p = flightPose({ speed: 0, flight: 0, viewPitch: -.12, pitch: -.12 }), life = createSuitAnimation(), mix = createFlightMix(), clips = rig(), legacy = rig();
  let yaw = 0;
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    const t = i / hz, d = drive((i - 1) / hz), v = d.velocity; yaw += yawRate(t) / hz;
    advanceFlightPose(p, { yaw, pitch: -.12, speed: Math.hypot(v.x, v.y, v.z), velocity: v, flying: d.flying, reduced: false }, 1 / hz);
    advanceSuitAnimation(life, p, d, 1 / hz); advanceFlightMix(mix, p, { paused: !!d.paused, reduced: false, flying: d.flying, velocity: v }, 1 / hz);
    frame(clips, p, mix, life, 1, false); frame(legacy, p, mix, life, 1, false, false); each(clips, legacy, t, life, p, mix);
  }
  return { p, mix, life };
}
const same = (a: Rig, b: Rig) => a.joints.every((j, k) => k < LEGACY_COUNT ? j.quaternion.equals(b.joints[k].quaternion) : j.quaternion.equals(new Quaternion()));
/** Lowest toe tip above the lower sole: the new toes must never dig below where the legacy foot stood. */
const toe = (r: Rig) => Math.min(...[19, 20].map(i => r.joints[i].localToWorld(new Vector3(0, -.029, -.065)).y))
  - Math.min(...[8, 9].map(i => r.joints[i].localToWorld(new Vector3(0, -.49, 0)).y));
function applyFlightPoseOnly(r: Rig, p: P, mix: Mix, life: Life, hero = 1) {
  const m = { hero, epoch: 0 }; orientSuit(r.root, p, m); applySuitPose(r.joints, p, m, false); applyFlightClips(r.joints, mix, p, life, hero, false);
}
const at = (vx: number, vy: number, vz: number): Vec => ({ x: vx, y: vy, z: vz });
describe('flight mix transitions', () => {
  it('leaves the ground exactly as before, and hands back to it bit-exact within 1.25 s of touchdown', () => {
    for (const drive of [(() => ({ flying: false, velocity: at(0, 0, -5) })), () => ({ flying: false, velocity: at(3, 0, 0) }), () => ({ flying: false, velocity: at(0, 0, 0) })] as Drive[])
      play(2, 60, drive, (clips, legacy) => expect(same(clips, legacy)).toBe(true));
    let exact = Number.NaN;
    play(4, 60, t => ({ flying: t < 1.5, velocity: at(0, t < 1.5 ? -2 : 0, 0) }), (clips, legacy, t) => {
      if (t > 1.5 && Number.isNaN(exact) && same(clips, legacy)) exact = t - 1.5;
      if (!Number.isNaN(exact)) expect(same(clips, legacy), `${t.toFixed(3)} s`).toBe(true);
    });
    expect(exact).toBeLessThanOrEqual(1.25);
  });
  it('keeps the toes at or above where the legacy foot stood through the takeoff hold and every touchdown', () => {
    const drives: Drive[] = [t => ({ flying: t >= 1, velocity: at(0, t >= 1 ? 6 : 0, 0) }), t => ({ flying: t < 1.5, velocity: at(0, t < 1.5 ? -2 : 0, 0) }),
      t => ({ flying: t < 1.5, landing: t < 1.5, velocity: at(0, t < 1.5 ? -1.5 : 0, 0) }), t => ({ flying: t < 1.5, velocity: at(0, t < 1.5 ? -1 : 0, t < 1.5 ? -8 : 0) })];
    const low = { hold: 9, blend: 9, after: 9 };
    for (const drive of drives) play(4, 60, drive, (clips, legacy, _, life) => {
      if (life.flying && life.takeoff > .1) return;
      const phase = life.flying ? 'hold' : life.switched < .15 ? 'blend' : 'after';
      low[phase] = Math.min(low[phase], toe(clips) - toe(legacy));
    });
    expect(low.hold).toBeGreaterThan(-.005); expect(low.after).toBeGreaterThan(-.005); expect(low.blend).toBeGreaterThan(-.02);
  });
  it('matches at 30, 60 and 120 Hz and never accumulates when posed again', () => {
    const drive: Drive = t => { const sp = t < 1 ? 0 : t < 3 ? 34 : t < 4.2 ? 13 : 2;
      return { flying: t >= .5, velocity: at(0, t >= 4.5 && t < 5.2 ? -3 : t >= .5 && t < .9 ? 6 : 0, -sp) }; };
    const ends = [30, 60, 120].map(hz => {
      // Every frame, including partial authority on takeoff and touchdown, poses a kept rig exactly as a fresh one.
      let last: Quaternion[] = [];
      const run = play(6, hz, drive, (c, _, t, life, p, mix) => { const fresh = rig(); frame(fresh, p, mix, life, 1, false);
        expect(quats(fresh.joints), `${hz} Hz ${t.toFixed(3)} s`).toEqual(quats(c.joints)); last = c.joints.map(j => j.quaternion.clone()); },
      { yawRate: t => t > 2 && t <= 3 ? 1.2 : 0 });
      expect(run.p.flight).toBeGreaterThan(.99); return last; });
    const worst = (a: Quaternion[], b: Quaternion[]) => Math.max(...a.map((q, i) => q.angleTo(b[i])));
    expect(worst(ends[0], ends[2])).toBeLessThan(5e-3); expect(worst(ends[1], ends[2])).toBeLessThan(5e-3);
    // The layer itself, fed the same timed inputs at each rate, samples the same pose every half second.
    const traces = [30, 60, 120].map(hz => { const mix = createFlightMix(), samples: number[][] = [], p = flightPose({ speed: 0 }); let yaw = 0;
      for (let i = 1; i <= 6 * hz; i++) {
        const t = (i - 1) / hz, speed = t < 1 ? 0 : t < 3 ? 34 : t < 4.2 ? 13 : 2; if (t >= 2 && t < 3) yaw += 1.2 / hz;
        Object.assign(p, flightPose({ speed, yaw, viewYaw: yaw, brake: t >= 3 && t < 3.3 ? 1 : 0 }));
        advanceFlightMix(mix, p, { paused: false, reduced: false, flying: true, velocity: at(-Math.sin(yaw) * speed, t >= 4.5 && t < 5.2 ? -3 : 0, -Math.cos(yaw) * speed) }, 1 / hz);
        if (i % (hz / 2) === 0) { const r = rig(); applyFlightPoseOnly(r, p, mix, cruising(i / hz)); samples.push(quats(r.joints)); }
      }
      return samples; });
    const apart = (a: number[][], b: number[][]) => Math.max(...a.flatMap((f, k) => f.map((v, i) => Math.abs(v - b[k][i]))));
    expect(traces[0]).toHaveLength(12); expect(apart(traces[0], traces[2])).toBeLessThan(2.5e-3); expect(apart(traces[1], traces[2])).toBeLessThan(2.5e-3);
  });
  it('blends from what the pose targets wrote this frame, weighted by the flight authority', () => {
    for (const hero of [0, 1]) for (const flight of [.2, .5, .8]) {
      const p = flightPose({ speed: 13, brake: .4, bank: .2 }), mix = createFlightMix(), life = cruising();
      advanceFlightMix(mix, p, { paused: false, reduced: false, flying: true, velocity: at(0, 0, -13) }, 1 / 60);
      const full = rig(); applyFlightPoseOnly(full, p, mix, life, hero);
      const legacy = rig(), part = rig(), partial = { ...p, flight }; const m = { hero, epoch: 0 };
      applySuitPose(legacy.joints, partial, m, false); applyFlightPoseOnly(part, partial, mix, life, hero);
      const A = (flight - .002) / .998;
      for (const b of [0, 1, 2, 5]) {
        const l = legacy.joints[b].quaternion, f = full.joints[b].quaternion, sl = l.w < 0 ? -1 : 1, sf = f.w < 0 ? -1 : 1;
        const want = new Quaternion(sl * l.x * (1 - A) + sf * f.x * A, sl * l.y * (1 - A) + sf * f.y * A, sl * l.z * (1 - A) + sf * f.z * A, sl * l.w * (1 - A) + sf * f.w * A).normalize();
        expect(Math.abs(Math.abs(want.dot(part.joints[b].quaternion)) - 1), `hero ${hero} flight ${flight} joint ${b}`).toBeLessThan(1e-6);
      }
    }
  });
  it('freezes while paused, resumes cleanly and restarts on a teleport', () => {
    const p = flightPose({ speed: 13, brake: 0 }), mix = createFlightMix(), go = { paused: false, reduced: false, flying: true, velocity: at(-13, 0, 0) };
    for (let i = 0; i < 30; i++) advanceFlightMix(mix, p, go, 1 / 60);
    const clock = mix.clock, bank = Array.from(mix.bank);
    for (let i = 0; i < 30; i++) advanceFlightMix(mix, p, { ...go, paused: true, velocity: at(0, 0, 40) }, 1 / 60);
    expect(mix.clock).toBe(clock); expect(Array.from(mix.bank)).toEqual(bank); expect(mix.held).toBe(true);
    advanceFlightMix(mix, p, { ...go, velocity: at(0, 0, -13) }, 1 / 60);
    expect(mix.held).toBe(false); expect(Math.max(...Array.from(mix.bank, Math.abs))).toBeLessThan(.05);
    for (let i = 0; i < 30; i++) advanceFlightMix(mix, p, go, 1 / 60);
    p.epoch = 3; advanceFlightMix(mix, p, { ...go, velocity: at(0, 0, 0) }, 1 / 60);
    expect(mix.epoch).toBe(3); expect(Math.max(...Array.from(mix.bank, Math.abs))).toBeLessThan(.05); expect(mix.lateral).toBe(0);
  });
  it('replaces the procedural hover drift with the authored tread in flight, keeping the bob', () => {
    const p = flightPose({ speed: 0 }), r = rig(), mix = createFlightMix(), life = createSuitAnimation(); let bob = [9, -9];
    for (let i = 0; i < 300; i++) {
      advanceSuitAnimation(life, p, { flying: true, velocity: at(0, 0, 0) }, 1 / 60); advanceFlightMix(mix, p, { paused: false, reduced: false, flying: true, velocity: at(0, 0, 0) }, 1 / 60);
      const lift = frame(r, p, mix, life, 1, false) && r.root.position.y; bob = [Math.min(bob[0], lift), Math.max(bob[1], lift)];
      // Everything the living layer adds to the arms in a still hover is drift, so with full authority the clip pose shows unchanged.
      const clip = rig(); applyFlightPoseOnly(clip, p, mix, life);
      for (const b of [2, 3, 6, 7]) for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(r.joints[b].rotation[axis] - clip.joints[b].rotation[axis]), `joint ${b}`).toBeLessThan(1e-6);
    }
    expect(bob[1] - bob[0]).toBeGreaterThan(.08);
  });
  it('stays finite and bounded for any input', () => {
    const r = rig(), life = createSuitAnimation(), mix = createFlightMix(); let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    for (let i = 0; i < 2000; i++) {
      const speed = pick([0, 5, 34, 1e6, Number.NaN]), p = flightPose({ speed: Number.isNaN(speed) ? 0 : speed, flight: random(), bank: pick([-10, 0, 10]),
        viewPitch: random() * 3 - 1.5, viewYaw: random() * 20 - 10, yaw: random() * 20 - 10, brake: random() });
      const v = at(pick([0, -1e6, 30]), pick([0, 1e6, -9]), pick([0, 1e6, -34, Number.NaN])), dt = pick([1 / 60, 0, -1, Number.NaN, 5, 1e-9]);
      const input = { paused: random() < .1, reduced: random() < .3, flying: random() < .8, velocity: v };
      advanceSuitAnimation(life, p, { ...input, velocity: Number.isFinite(v.z) ? v : at(0, 0, 0) }, Number.isFinite(dt) ? dt : 0);
      advanceFlightMix(mix, p, input, dt); frame(r, p, mix, life, random(), input.reduced);
      expect(r.joints.every(j => j.quaternion.toArray().every(Number.isFinite)), `state ${i}`).toBe(true);
      expect([mix.clock, mix.slope, mix.fist, mix.steer, mix.lateral, mix.command, ...mix.bank, ...mix.brake].every(Number.isFinite)).toBe(true);
    }
  });
});
