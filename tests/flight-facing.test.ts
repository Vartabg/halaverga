import { describe, expect, it } from 'vitest';
import { advanceFlightPose, FACING } from '../src/game/presentation';
import { advanceSuitAnimation, createSuitAnimation } from '../src/world/suitAnimation';
import { Vector3, Quaternion, Euler } from 'three';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { advanceFlightMix, createFlightMix, cruising, flightPose, frame, idx, measure, rig, settledMix } from './flight-harness';
import { drive, edge, keyboard, tap, thumb, trackpad, type Device } from './flight-drive';
import { speedFade } from '../src/world/suitRoll';
import { boomFor } from '../src/game/cameraFx';
/** CameraRig's hip boom on a phone in landscape (short viewport, w 1): nearer and lower than CHASE_BOOM. */
const SHORT = boomFor(0, 852 / 393, { x: 0, y: 0, z: 0 }, 1);
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
  it('over the static grid of view, body offset, bank, speed, yaw, style, brake, phase, reduced motion and turn roll', () => {
    const r = rig(), life = cruising(), worst = start(), short = start();
    for (const viewPitch of PITCHES) for (const offset of [-FACING.pitchDown, 0, FACING.pitchUp]) for (const bank of [-.3, 0, .3])
      for (const speed of [0, 8, 13, 20, 34]) for (const yaw of [-FACING.yaw, 0, FACING.yaw]) for (const hero of [0, 1]) for (const brake of [0, .6, 1])
        for (const clock of [0, 1.1, 2.3, 3.4]) for (const reduced of [false, true]) for (const roll of [-.8, 0, .8]) {
          // Full braking needs at least 8 m/s to decelerate from; the fist is up from 15 m/s.
          if (brake > .6 && speed < 8) continue;
          const p = flightPose({ viewPitch, pitch: viewPitch + offset, bank: reduced ? 0 : bank, speed, yaw, brake });
          const mix = settledMix(p, { x: 0, y: Math.sin(p.pitch) * speed, z: -Math.cos(p.pitch) * speed }, reduced);
          mix.clock = clock; mix.slope = speed > 2 ? Math.sin(p.pitch) : 0; mix.fist = speed >= 15 ? 1 : 0; life.time = clock * 1.19;
          mix.bank.fill(reduced ? 0 : bank / .3); mix.steer = reduced ? 0 : bank / .3;
          // The hover tilt fades as Suit.tsx fades it, with the horizontal speed, so the grid holds only reachable states.
          frame(r, p, mix, life, hero, reduced, true, roll, speedFade(speed * Math.cos(p.pitch)));
          const at = () => JSON.stringify({ viewPitch, offset, bank, speed, yaw, hero, brake, reduced, roll });
          record(worst, measure(r, p), bank === 0 && yaw === 0, mix.clamped, at);
          record(short, measure(r, p, SHORT), bank === 0 && yaw === 0, mix.clamped, at);
        }
    if (process.env.ROLL_REPORT) console.log(`static grid: chest min ${worst.chest.toFixed(4)} straight ${worst.straight.toFixed(3)} face max ${worst.face.toFixed(3)}`);
    expect(worst.chest, worst.at).toBeGreaterThan(.05); expect(worst.straight).toBeGreaterThan(.1);
    expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    // The joint limits are a guard, not a shaper: normal play never reaches them.
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
    // The same body, seen from the nearer phone-landscape boom.
    expect(short.chest, short.at).toBeGreaterThan(.05); expect(short.straight).toBeGreaterThan(.1);
    expect(short.face).toBeLessThan(0);
  }, 30000);
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
  it('through turn rolls from every input device at 8, 13 and 34 m/s, both ways, camera from overhead to below', () => {
    const worst = start(), r = rig(), flat = rig(); let drift = 0;
    const devices: Record<string, (speed: number, dir: number) => Device> = { keyboard: (speed, dir) => ({ ...keyboard(13, dir), speed }), edge, thumb, trackpad,
      's-turn': (speed, dir) => ({ speed, pointer: false, rate: t => t >= 1 && t < 4 ? (Math.floor(t) % 2 ? 1.5 : -1.5) * dir : 0 }),
      taps: (speed, dir) => ({ ...tap(dir, [1, 1.3, 1.6]), speed }) };
    for (const [name, make] of Object.entries(devices)) for (const speed of [8, 13, 34]) for (const dir of [1, -1]) for (const pitch of PITCHES)
      for (const hero of [0, 1]) for (const reduced of [false, true]) {
        const device = make(speed, dir);
        drive(device, { pitch, hero, reduced: () => reduced, seconds: 4.5, rig: r }, f => {
          const s = measure(r, f.p); frame(flat, f.p, f.mix, f.life, hero, reduced, true, 0, f.fade); const t = measure(flat, f.p);
          drift = Math.max(drift, Math.abs(s.chest - t.chest), Math.abs(s.face - t.face));
          record(worst, s, false, f.mix.clamped, () => JSON.stringify({ name, speed, dir, pitch, hero, reduced, t: f.t }));
        });
      }
    expect(worst.chest, worst.at).toBeGreaterThan(.1); expect(worst.face).toBeLessThan(0); expect(worst.yaw).toBeLessThanOrEqual(.1);
    expect(worst.clamped).toBe(0); expect(worst.hinges).toBe(true); expect(worst.finite).toBe(true);
    // The roll turns the body about the line to the camera, so it moves neither measure.
    expect(drift).toBeLessThan(1e-6);
    if (process.env.ROLL_REPORT) console.log(`device grid: chest min ${worst.chest.toFixed(3)} face max ${worst.face.toFixed(3)} drift ${drift.toExponential(1)}`);
  }, 30000);
  it('keeps the back toward the camera that actually renders: the eased boom, shortened 40% against a wall', () => {
    const r = rig(), boom = new Vector3(), aim = new Vector3(), look = new Vector3(), q = new Quaternion(), view = new Euler(0, 0, 0, 'YXZ');
    let chest = 9, at = '';
    for (const make of [(d: number) => keyboard(34, d), (d: number) => keyboard(13, d), (d: number) => thumb(13, d), (d: number) => trackpad(13, d)])
      for (const dir of [1, -1]) for (const pitch of PITCHES) for (const hero of [0, 1]) {
        let first = true;
        drive(make(dir), { pitch, hero, seconds: 4, rig: r }, f => {
          // CameraRig.tsx: the boom eases toward the view frame at rate 12 from the head; a wall hit shortens it.
          aim.set(CHASE_BOOM.x, CHASE_BOOM.y, CHASE_BOOM.z).applyEuler(view.set(f.p.viewPitch, f.p.viewYaw, 0));
          boom.lerp(aim, first ? 1 : 1 - Math.exp(-12 / 60)); first = false;
          for (const length of [1, .6]) {
            look.copy(boom).multiplyScalar(length).add(new Vector3(0, CHASE_HEAD, 0)).normalize();
            const c = new Vector3(0, 0, 1).applyQuaternion(r.joints[idx.chest].getWorldQuaternion(q)).dot(look);
            if (c < chest) { chest = c; at = JSON.stringify({ dir, pitch, hero, length, t: f.t }); }
          }
        });
      }
    expect(chest, at).toBeGreaterThan(.05);
    if (process.env.ROLL_REPORT) console.log(`eased and shortened boom: chest min ${chest.toFixed(3)} ${at}`);
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
