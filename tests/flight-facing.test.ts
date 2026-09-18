import { describe, expect, it } from 'vitest';
import { advanceFlightPose, FACING } from '../src/game/presentation';
import { advanceSuitAnimation, createSuitAnimation } from '../src/world/suitAnimation';
import { advanceFlightMix, createFlightMix, cruising, flightPose, frame, measure, rig, settledMix } from './flight-harness';
const PITCHES = [-1.3, -.8, -.12, 0, .5, 1, 1.25];
type Worst = { chest: number; straight: number; face: number; yaw: number; clamped: number; hinges: boolean; finite: boolean; at: string };
const start = (): Worst => ({ chest: 9, straight: 9, face: -9, yaw: 0, clamped: 0, hinges: true, finite: true, at: '' });
function record(worst: Worst, s: ReturnType<typeof measure>, straight: boolean, clamped: number, at: () => string) {
  if (s.chest < worst.chest) { worst.chest = s.chest; worst.at = at(); }
  if (straight) worst.straight = Math.min(worst.straight, s.chest);
  worst.face = Math.max(worst.face, s.face); worst.yaw = Math.max(worst.yaw, s.yaw); worst.clamped = Math.max(worst.clamped, clamped);
  worst.hinges &&= s.hinges; worst.finite &&= s.finite;
}
describe('flight clips keep the back toward the chase camera', () => {
  it('over the static grid of view, body offset, bank, speed, yaw, style, brake, phase and reduced motion', () => {
    const r = rig(), life = cruising(), worst = start();
    for (const viewPitch of PITCHES) for (const offset of [-FACING.pitchDown, 0, FACING.pitchUp]) for (const bank of [-.3, 0, .3])
      for (const speed of [0, 8, 13, 20, 34]) for (const yaw of [-FACING.yaw, 0, FACING.yaw]) for (const hero of [0, 1]) for (const brake of [0, .6, 1])
        for (const clock of [0, 1.1, 2.3, 3.4]) for (const reduced of [false, true]) {
          // Full braking needs at least 8 m/s to decelerate from; the fist is up from 15 m/s.
          if (brake > .6 && speed < 8) continue;
          const p = flightPose({ viewPitch, pitch: viewPitch + offset, bank: reduced ? 0 : bank, speed, yaw, brake });
          const mix = settledMix(p, { x: 0, y: Math.sin(p.pitch) * speed, z: -Math.cos(p.pitch) * speed }, reduced);
          mix.clock = clock; mix.slope = speed > 2 ? Math.sin(p.pitch) : 0; mix.fist = speed >= 15 ? 1 : 0; life.time = clock * 1.19;
          mix.bank.fill(reduced ? 0 : bank / .3); mix.steer = reduced ? 0 : bank / .3;
          frame(r, p, mix, life, hero, reduced);
          record(worst, measure(r, p), bank === 0 && yaw === 0, mix.clamped, () => JSON.stringify({ viewPitch, offset, bank, speed, yaw, hero, brake, reduced }));
        }
    expect(worst.chest, worst.at).toBeGreaterThan(.05); expect(worst.straight).toBeGreaterThan(.1);
    expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    // The joint limits are a guard, not a shaper: normal play never reaches them.
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
  });
  it('through hard stops and turns with the full stack, camera from overhead to below', () => {
    const worst = start();
    for (const viewPitch of [-1.3, -.8, 0, .6, 1.25]) for (const drag of [0, .9, .96]) for (const reduced of [false, true]) for (const turn of [0, 1.2, -1.2])
      for (const hero of [0, 1]) for (const from of [13, 34]) {
        const p = flightPose({ speed: 0, viewPitch, pitch: viewPitch }), r = rig(), life = createSuitAnimation(), mix = createFlightMix();
        let speed = from, yaw = 0;
        for (let f = 0; f < 240; f++) {
          if (f >= 90) speed = drag ? speed * drag : 0;
          yaw += turn / 60;
          const velocity = { x: -Math.sin(yaw) * speed, y: 0, z: -Math.cos(yaw) * speed };
          advanceFlightPose(p, { yaw, pitch: viewPitch, speed, velocity, flying: true, reduced }, 1 / 60);
          advanceSuitAnimation(life, p, { flying: true, velocity }, 1 / 60);
          advanceFlightMix(mix, p, { paused: false, reduced, flying: true, velocity }, 1 / 60);
          frame(r, p, mix, life, hero, reduced);
          record(worst, measure(r, p), turn === 0, mix.clamped, () => JSON.stringify({ viewPitch, drag, reduced, turn, hero, from, f }));
        }
      }
    expect(worst.chest, worst.at).toBeGreaterThan(.1); expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
  });
});
