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
type Run = { viewPitch: number; drag: number; reduced: boolean; turn: number; hero: number; from: number };
/** Flies at `from`, stops at frame 90 (instantly, or dragging per frame) while the view turns, through the full stack at 60 Hz. */
function stopAndTurn(worst: Worst, { viewPitch, drag, reduced, turn, hero, from }: Run, frames: number) {
  const p = flightPose({ speed: 0, viewPitch, pitch: viewPitch }), r = rig(), life = createSuitAnimation(), mix = createFlightMix();
  let speed = from, yaw = 0;
  for (let f = 0; f < frames; f++) {
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
      for (const hero of [0, 1]) for (const from of [13, 34]) stopAndTurn(worst, { viewPitch, drag, reduced, turn, hero, from }, 240);
    expect(worst.chest, worst.at).toBeGreaterThan(.1); expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
  });
  it('through a 40 s hover turn under the overhead camera, so every hover phase meets every view', () => {
    const worst = start();
    for (const viewPitch of [-1.3, -.8]) for (const reduced of [false, true]) for (const turn of [1.2, -1.2]) for (const hero of [0, 1])
      stopAndTurn(worst, { viewPitch, drag: 0, reduced, turn, hero, from: 13 }, 2400);
    expect(worst.chest, worst.at).toBeGreaterThan(.1); expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
  });
  it('never reaches a joint limit on a wider grid, including full braking and banking at 4-6 m/s while descending', () => {
    const r = rig(), life = cruising(); let clamped = 0, at = '';
    for (const speed of [0, 2, 4, 5, 6, 8, 10, 13, 16, 20, 25, 34]) for (const bank of [-1, -.5, 0, .5, 1]) for (const brake of [0, .4, .7, 1])
      for (const slope of [-1, -.5, 0, .5, 1]) for (const clock of [0, .6, 1.1, 1.7, 2.3, 2.9, 3.4]) for (const hero of [0, 1]) for (const reduced of [false, true]) {
        const pitch = slope * .9, p = flightPose({ speed, pitch, viewPitch: pitch, brake });
        const mix = settledMix(p, { x: 0, y: Math.sin(pitch) * speed, z: -Math.cos(pitch) * speed }, reduced);
        Object.assign(mix, { clock, slope: speed > 2 ? Math.sin(pitch) : 0, fist: speed >= 15 ? 1 : 0, steer: reduced ? 0 : bank, flare: speed < 3 && slope <= 0 ? 1 : 0 });
        mix.bank.fill(reduced ? 0 : bank); life.time = clock * 1.19; frame(r, p, mix, life, hero, reduced);
        if (mix.clamped > clamped) { clamped = mix.clamped; at = JSON.stringify({ speed, bank, brake, slope, clock, hero, reduced }); }
      }
    expect(clamped, at).toBe(0);
  });
  it('keeps the takeoff launch inside the joint limits over the hover tread, climbing or not', () => {
    let clamped = 0, at = '';
    for (const hero of [0, 1]) for (const reduced of [false, true]) for (const slope of [0, 1]) for (let k = 0; k <= 100; k++) for (const time of [0, .6, 1.2, 1.8, 2.4, 3, 3.6, 4.2]) {
      const p = flightPose({ speed: 6 * slope }), mix = settledMix(p, { x: 0, y: 6 * slope, z: 0 }, reduced), life = cruising(time);
      mix.slope = slope; life.takeoff = k / 100; frame(rig(), p, mix, life, hero, reduced);
      if (mix.clamped > clamped) { clamped = mix.clamped; at = JSON.stringify({ hero, reduced, slope, takeoff: k / 100, time }); }
    }
    expect(clamped, at).toBe(0);
  });
});
