import { describe, expect, it } from 'vitest';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { BONE_NAMES } from '../src/world/suitSkeleton';
import { landing, local, play, snapshot, TOE_TIP, turned } from './flight-sim';
import { cruising, flightPose, frame, idx, rig, settledMix } from './flight-harness';
const DEG = Math.PI / 180;
/** Landings Player.tsx flies: short, down and forward, and long and to the side. */
const LANDINGS = [[{ x: 0, y: 22.5, z: 0 }, { x: 0, y: 21.06, z: -1 }], [{ x: 0, y: 25, z: 0 }, { x: 0, y: 21.06, z: -8 }],
  [{ x: 0, y: 30, z: 0 }, { x: 5, y: 21.06, z: -20 }]] as const;
describe('flight clip motion continuity', () => {
  it('carries the landing flare and look-down through touchdown: no joint jumps more than clips-off plus 3 degrees (3.5 at the shins)', () => {
    // The shins carry the living layer's absorb onset (about 8.8 degrees in both rigs); clips-off partly cancels it with its
    // fading hover drift, which the authored tread replaces, so they get half a degree more.
    const margin = BONE_NAMES.map(n => (n.startsWith('shin') ? 3.5 : 3) * DEG);
    for (const [from, goal] of LANDINGS) for (const reduced of [false, true]) {
      let before: ReturnType<typeof snapshot> | null = null, legacyBefore: ReturnType<typeof snapshot> | null = null, excess = -9, at = "";
      play(9, 60, landing(from, goal), s => {
        const now = snapshot(s.clips), legacy = snapshot(s.legacy);
        if (before && legacyBefore && !s.life.flying && s.life.switched < 1e-9 + 1 / 60) {
          const clips = turned(before, now), off = turned(legacyBefore, legacy);
          clips.forEach((d, b) => { if (d - off[b] - margin[b] > excess) { excess = d - off[b] - margin[b]; at = `${BONE_NAMES[b]} ${(d / DEG).toFixed(2)} vs ${(off[b] / DEG).toFixed(2)} deg`; } });
        }
        before = now; legacyBefore = legacy;
      }, { reduced });
      expect(excess, `${JSON.stringify(goal)} reduced ${reduced}: ${at}`).toBeGreaterThan(-9);
      expect(excess, `${JSON.stringify(goal)} reduced ${reduced}: ${at}`).toBeLessThanOrEqual(0);
    }
  });
  it('sets off in a new direction after hovering without a fake carve, at 30, 60, 120 and 144 Hz', () => {
    for (const turn of [0, Math.PI / 2, Math.PI]) for (const hz of [30, 60, 120, 144]) {
      let v: Vec = { x: 0, y: 0, z: 0 }, peak = 0;
      // Hover 1 s, turn the view over .4 s, wait .5 s, then hold forward.
      play(3.5, hz, (t, dt) => {
        const yaw = turn * Math.min(1, Math.max(0, (t - 1) / .4));
        v = advanceVelocity(v, { forward: t >= 1.9 ? 1 : 0, strafe: 0, vertical: 0 }, yaw, 0, true, false, dt);
        return { velocity: v, flying: true, yaw, pitch: 0 };
      }, s => { peak = Math.max(peak, Math.abs(s.mix.bank[idx.chest])); });
      expect(peak, `turn ${turn.toFixed(2)} at ${hz} Hz`).toBeLessThan(.02);
    }
  });
  it('eases the raised fist into a surge turn and through its reversal: the wrist never jolts more than 1 cm/frame\u00b2 beyond clips-off', () => {
    const jolt = { clips: 0, legacy: 0 }, last = { clips: [] as Vec[], legacy: [] as Vec[] };
    let v: Vec = { x: 0, y: 0, z: 0 }, yaw = 0;
    // Surge 3 s with the fist up, turn left for 1 s at the keyboard rate, then right for 1 s (60 Hz, hero poses).
    play(5.5, 60, (t, dt) => {
      if (t >= 3 && t < 5) yaw += (t < 4 ? 1.5 : -1.5) * dt;
      v = advanceVelocity(v, { forward: 1, strafe: 0, vertical: 0 }, yaw, 0, true, true, dt);
      return { velocity: v, flying: true, yaw, pitch: 0 };
    }, s => {
      for (const key of ['clips', 'legacy'] as const) {
        const trail = last[key]; trail.push(local(s[key], idx.handR).multiplyScalar(100)); if (trail.length > 3) trail.shift();
        if (s.t < 2.95 || trail.length < 3) continue;
        const [a, b, c] = trail, change = Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y, c.z - 2 * b.z + a.z);
        jolt[key] = Math.max(jolt[key], change);
      }
    });
    expect(jolt.clips, `clips-off ${jolt.legacy.toFixed(2)} cm/frame\u00b2`).toBeLessThanOrEqual(jolt.legacy + 1);
  });
  it('eases the hero fist up and down: at deploy and stow the wrist never jolts more than 2 cm/frame\u00b2 beyond clips-off', () => {
    const jolt = { clips: [0, 0], legacy: [0, 0] }, trail = { clips: [] as Vec[], legacy: [] as Vec[] }, switched = [Infinity, Infinity];
    let v: Vec = { x: 0, y: 0, z: 0 };
    // Hover, surge from 1 s to 4 s, then fly on at keyboard speed: the fist deploys at 20 m/s and stows at 15 m/s.
    play(6, 60, (t, dt) => {
      v = advanceVelocity(v, { forward: t >= 1 ? 1 : 0, strafe: 0, vertical: 0 }, 0, 0, true, t < 4, dt);
      return { velocity: v, flying: true, yaw: 0, pitch: 0 };
    }, s => {
      if (s.mix.fistOn && switched[0] === Infinity) switched[0] = s.t;
      if (!s.mix.fistOn && switched[0] < s.t && switched[1] === Infinity) switched[1] = s.t;
      for (const key of ['clips', 'legacy'] as const) {
        const last = trail[key]; last.push(local(s[key], idx.handR).multiplyScalar(100)); if (last.length > 3) last.shift();
        if (last.length < 3) continue;
        const [a, b, c] = last, change = Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y, c.z - 2 * b.z + a.z);
        switched.forEach((at, k) => { if (s.t >= at - .05 && s.t <= at + .6) jolt[key][k] = Math.max(jolt[key][k], change); });
      }
    });
    expect(switched[1]).toBeLessThan(6);
    for (const k of [0, 1]) expect(jolt.clips[k], `${k ? 'stow' : 'deploy'}, clips-off ${jolt.legacy[k].toFixed(2)} cm/frame\u00b2`).toBeLessThanOrEqual(jolt.legacy[k] + 2);
  });
  it('reads a descent at keyboard speed as the dive stoop: wrists and toe tips move at least 15 and 5 cm, the way the dive moves them', () => {
    // Wrists and toe tips in the root frame, flying level or descending at pitch -.9 (hero off, so the fist leaves the right arm free).
    const tips = (speed: number, slope: number) => {
      const pitch = slope ? -.9 : 0, p = flightPose({ speed, pitch: -.9, viewPitch: -.9 }), r = rig();
      const mix = settledMix(p, { x: 0, y: Math.sin(pitch) * speed, z: -Math.cos(pitch) * speed }); mix.clock = 1.1; mix.slope = slope; mix.fist = 0;
      frame(r, p, mix, cruising(1.3), 0, false);
      return [local(r, idx.handR), local(r, 15), local(r, idx.toeL, TOE_TIP), local(r, idx.toeR, TOE_TIP)];
    };
    const move = (speed: number) => { const level = tips(speed, 0); return tips(speed, -Math.sin(.9)).map((v, k) => v.sub(level[k])); };
    // At full power the descent is all dive: it sets the direction a keyboard-speed descent must share.
    const cruise = move(13), dive = move(34), moved = cruise.map(v => v.length());
    expect(Math.min(moved[0], moved[1])).toBeGreaterThanOrEqual(.15); expect(Math.min(moved[2], moved[3])).toBeGreaterThanOrEqual(.05);
    cruise.forEach((v, k) => expect(v.clone().normalize().dot(dive[k].clone().normalize()), `tip ${k}`).toBeGreaterThan(.7));
  });
});
