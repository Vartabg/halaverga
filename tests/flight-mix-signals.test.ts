import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { advanceFlightPose } from '../src/game/presentation';
import { advanceSuitAnimation, createSuitAnimation } from '../src/world/suitAnimation';
import { advanceSuitMotion } from '../src/world/suitPose';
import { applyFlightClips } from '../src/world/flightPose';
import { FIST, type FlightMix } from '../src/world/flightMix';
import { advanceFlightMix, createFlightMix, cruising, flightPose, frame, idx, rig, settledMix } from './flight-harness';
const still: Vec = { x: 0, y: 0, z: 0 };
/** Steps only the mix at 60 Hz through a list of (speed, seconds) holds, travelling straight ahead. */
function hold(mix: FlightMix, steps: [speed: number, seconds: number][], reduced = false) {
  const p = flightPose();
  for (const [speed, seconds] of steps) for (let i = 0; i < seconds * 60; i++) {
    p.speed = speed; advanceFlightMix(mix, p, { paused: false, reduced, flying: true, velocity: { x: 0, y: 0, z: -speed } }, 1 / 60);
  }
  return mix;
}
/** A keyboard turn at flight speed (or surge): 2 s straight, then the view turns at 1.5 rad/s for 2 s. */
function keyboardTurn(direction: 1 | -1, surge = false, reduced = false) {
  const p = flightPose({ speed: 0 }), life = createSuitAnimation(), mix = createFlightMix(); let v: Vec = still, yaw = 0;
  const trace: { t: number; bank: number; steer: number }[] = [];
  for (let i = 0; i < 300; i++) {
    const t = i / 60; if (t > 2 && t < 4) yaw += direction * 1.5 / 60;
    v = advanceVelocity(v, { forward: 1, strafe: 0, vertical: 0 }, yaw, 0, true, surge, 1 / 60);
    advanceFlightPose(p, { yaw, pitch: 0, speed: Math.hypot(v.x, v.y, v.z), velocity: v, flying: true, reduced }, 1 / 60);
    advanceSuitAnimation(life, p, { flying: true, velocity: v }, 1 / 60); advanceFlightMix(mix, p, { paused: false, reduced, flying: true, velocity: v }, 1 / 60);
    trace.push({ t, bank: mix.bank[idx.chest], steer: mix.steer });
  }
  return trace;
}
const first = (trace: { t: number }[], test: (s: never) => boolean) => trace.find(s => test(s as never))?.t ?? Infinity;
describe('flight mix signals', () => {
  it('labels the clip on show for telemetry', () => {
    const label = (speed: number, hero: number, patch = {}) => { const p = flightPose({ speed, ...patch }), mix = settledMix(p, { x: 0, y: 0, z: -speed });
      mix.fist = speed >= FIST.up ? 1 : 0; frame(rig(), p, mix, cruising(), hero, false); return mix.label; };
    expect([label(0, 1), label(8, 1), label(34, 0), label(34, 1), label(13, 1, { brake: 1 }), label(0, 1, { flight: 0 })])
      .toEqual(['hover', 'cruise', 'power', 'power-hero', 'brake', 'ground']);
  });
  it('deploys the hero fist with hysteresis: up at 20 m/s, down at 15 m/s, never half-raised at a held speed', () => {
    expect(hold(createFlightMix(), [[13, 3]]).fist).toBeLessThan(1e-6);
    expect(hold(createFlightMix(), [[34, 1]]).fist).toBeGreaterThan(.99);
    expect(hold(createFlightMix(), [[34, 1], [18, 2]]).fist).toBeGreaterThan(.99);
    expect(hold(createFlightMix(), [[13, 1], [18, 2]]).fist).toBeLessThan(1e-6);
    expect(hold(createFlightMix(), [[34, 1], [18, 1], [FIST.down, 2]]).fist).toBeLessThan(1e-3);
  });
  it('aims the deployed fist just above the travel axis, right of the head, at every fist speed and slope', () => {
    for (const speed of [16, 20, 25, 34]) for (const pitch of [0, .3, -.3]) {
      const p = flightPose({ speed, pitch, viewPitch: pitch }), r = rig(), mix = settledMix(p, { x: 0, y: Math.sin(pitch) * speed, z: -Math.cos(pitch) * speed });
      mix.fist = 1; mix.slope = 0; frame(r, p, mix, cruising(), 1, false);
      const at = (b: number) => r.joints[b].getWorldPosition(new Vector3()), hand = at(idx.handR), direction = hand.clone().sub(at(idx.upperarmR)).normalize();
      const elevation = (Math.asin(direction.y) - pitch) * 180 / Math.PI, right = hand.x - at(idx.head).x;
      expect(elevation, `${speed} m/s pitch ${pitch}`).toBeGreaterThan(2); expect(elevation).toBeLessThan(12);
      expect(right).toBeGreaterThan(.12); expect(right).toBeLessThan(.3); expect(direction.z).toBeLessThan(-.9);
      // The look budget lifts the head to look ahead along the travel, not at the ground below the leaning body.
      const look = new Vector3(0, 0, -1).applyQuaternion(r.joints[idx.head].getWorldQuaternion(new Quaternion())), below = pitch - Math.asin(look.y);
      expect(below * 180 / Math.PI).toBeGreaterThan(0); expect(below * 180 / Math.PI).toBeLessThan(25);
    }
  });
  it('carves keyboard turns from the travel, with the fist steer leading the body, mirrored for right turns', () => {
    for (const surge of [false, true]) {
      const left = keyboardTurn(1, surge), right = keyboardTurn(-1, surge);
      expect(Math.max(...left.map(s => s.bank)), `surge ${surge}`).toBeGreaterThan(.8);
      expect(first(left, (s: { steer: number }) => s.steer > .5) + .1).toBeLessThan(first(left, (s: { bank: number }) => s.bank > .5));
      left.forEach((s, i) => { expect(right[i].bank).toBeCloseTo(-s.bank, 4); expect(right[i].steer).toBeCloseTo(-s.steer, 4); });
    }
    expect(keyboardTurn(1, false, true).every(s => s.bank === 0 && s.steer === 0)).toBe(true);
  });
  it('leans into a side-slip and braces against backward flight', () => {
    const p = flightPose({ speed: 13 }), r = rig(), life = cruising();
    const slip = hold(createFlightMix(), []); for (let i = 0; i < 60; i++) advanceFlightMix(slip, p, { paused: false, reduced: false, flying: true, velocity: { x: 13, y: 0, z: 0 } }, 1 / 60);
    expect(slip.bank[idx.chest]).toBeLessThan(-.45); frame(r, p, slip, life, 1, false); expect(slip.label).toBe('bank-right');
    const back = createFlightMix(); for (let i = 0; i < 60; i++) advanceFlightMix(back, p, { paused: false, reduced: false, flying: true, velocity: { x: 0, y: 0, z: 8 } }, 1 / 60);
    expect(back.brake[idx.chest]).toBeGreaterThan(.99); frame(r, p, back, life, 1, false); expect(back.label).toBe('brake');
  });
  it('breaks through the body in succession: 60 ms into a brake the chest leads the upper arm, which leads the hand', () => {
    const mix = hold(createFlightMix(), [[13, 1]]), p = flightPose({ speed: 13, brake: 1 });
    for (let i = 0; i < 6; i++) advanceFlightMix(mix, p, { paused: false, reduced: false, flying: true, velocity: { x: 0, y: 0, z: -13 } }, .01);
    expect(mix.brake[idx.chest]).toBeGreaterThan(mix.brake[idx.upperarmR] + .05); expect(mix.brake[idx.upperarmR]).toBeGreaterThan(mix.brake[idx.handR] + .05);
  });
  it('selects climb, dive and sink from the velocity, never from where the camera looks', () => {
    const slope = (vy: number, viewPitch: number) => { const mix = createFlightMix(), p = flightPose({ speed: 13, viewPitch, pitch: viewPitch });
      for (let i = 0; i < 90; i++) advanceFlightMix(mix, p, { paused: false, reduced: false, flying: true, velocity: { x: 0, y: vy, z: -12 } }, 1 / 60); return mix.slope; };
    expect(Math.abs(slope(0, 1.2))).toBeLessThan(1e-9); expect(Math.abs(slope(0, -1.2))).toBeLessThan(1e-9);
    expect(slope(8, -1.2)).toBeGreaterThan(.5); expect(slope(-8, 1.2)).toBeLessThan(-.5);
  });
  it('crossfades the hero style at power in front of the face: the fist arm rises monotonically and never swings back', () => {
    for (const [from, to] of [[0, 1], [1, 0]]) {
      const p = flightPose({ speed: 34 }), r = rig(), mix = settledMix(p, { x: 0, y: 0, z: -34 }), life = cruising(), motion = { hero: from, epoch: 0 };
      mix.fist = 1; let previous = from ? 9 : -9;
      for (let i = 0; i < 90; i++) {
        advanceSuitMotion(motion, to === 1, 1 / 60); frame(r, p, mix, life, motion.hero, false);
        const x = r.joints[idx.upperarmR].rotation.x;
        expect(x).toBeGreaterThan(-.4); expect(to ? x >= previous - 1e-6 : x <= previous + 1e-6).toBe(true); previous = x;
      }
    }
  });
  it('under reduced motion keeps every pose at full strength and damps only the loops, to at most 30 %', () => {
    const spread = (reduced: boolean) => {
      const p = flightPose({ speed: 8 }), mix = settledMix(p, { x: 0, y: 0, z: -8 }, reduced), r = rig(), life = cruising(); let worst = 0;
      applyFlightClips(r.joints, mix, p, life, 1, reduced); const rest = r.joints.map(j => j.quaternion.clone());
      for (let k = 1; k < 40; k++) { mix.clock = k / 10; life.time = k / 10; applyFlightClips(r.joints, mix, p, life, 1, reduced);
        r.joints.forEach((j, b) => { if (b >= 10) worst = Math.max(worst, j.quaternion.angleTo(rest[b])); }); }
      return worst;
    };
    expect(spread(true)).toBeLessThanOrEqual(spread(false) * .3 + 1e-3); expect(spread(false)).toBeGreaterThan(.05);
    const fist = (reduced: boolean) => { const p = flightPose({ speed: 34 }), mix = hold(createFlightMix(), [[34, 1]], reduced), r = rig();
      mix.clock = 0; applyFlightClips(r.joints, mix, p, cruising(), 1, reduced); return r.joints[idx.upperarmR].quaternion.clone(); };
    expect(fist(true).angleTo(fist(false))).toBeLessThan(1e-3);
  });
});
