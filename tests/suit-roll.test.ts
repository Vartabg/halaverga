import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { advanceSuitRoll, createSuitRoll, ROLL } from '../src/world/suitRoll';
import { createTurnSweep, sweepTurn } from '../src/game/turnSweep';
import { flightPose, frame, idx, rig } from './flight-harness';
import { drive, edge, keyboard, peak, tap, thumb, trackpad, type Device, type Frame, type Options } from './flight-drive';
const DEVICES: [string, Device, Device][] = [['keyboard 13', keyboard(13), keyboard(13, -1)], ['keyboard 34', keyboard(34), keyboard(34, -1)],
  ['edge 8', edge(8), edge(8, -1)], ['thumb 13', thumb(13), thumb(13, -1)], ['trackpad 13', trackpad(13), trackpad(13, -1)], ['tap', tap(), tap(-1)]];
const RATES = [30, 45, 90, 120, 144, 165];
const q = new Quaternion(), view = new Euler(0, 0, 0, 'YXZ'), right = new Vector3(), camRight = new Vector3(), camUp = new Vector3();
/** On-screen tilt (rad) of the chest's right axis in the chase image. */
function tilt(r: ReturnType<typeof rig>, p: { viewPitch: number; viewYaw: number }) {
  view.set(p.viewPitch, p.viewYaw, 0); camRight.set(1, 0, 0).applyEuler(view); camUp.set(0, 1, 0).applyEuler(view);
  right.set(1, 0, 0).applyQuaternion(r.joints[idx.chest].getWorldQuaternion(q)); return Math.atan2(right.dot(camUp), right.dot(camRight));
}
const rolls = (device: Device, options: Options = {}) => { const out: Frame[] = []; drive(device, options, f => out.push({ ...f })); return out; };
/** Largest roll rate and largest frame-to-frame change of the roll rate (rad/s) over a run at `hz`. */
function smoothness(device: Device, hz: number, options: Options = {}) {
  let previous = 0, rate = 0, fastest = 0, jolt = 0, i = 0;
  drive(device, { ...options, hz }, f => {
    const now = (f.roll - previous) * hz; fastest = Math.max(fastest, Math.abs(now));
    if (i++ > 0) jolt = Math.max(jolt, Math.abs(now - rate)); rate = now; previous = f.roll;
  });
  return { fastest, jolt };
}
describe('whole-body turn roll', () => {
  it('rolls into the turn the travel makes, for every input device, and the right turn mirrors the left exactly', () => {
    const floors: Record<string, number> = { 'keyboard 13': .5, 'keyboard 34': .7, 'edge 8': .3, 'thumb 13': .35, 'trackpad 13': .45, tap: .12 };
    for (const [name, left, right] of DEVICES) {
      const l = rolls(left), r = rolls(right), top = Math.max(...l.map(f => f.roll));
      expect(top, name).toBeGreaterThan(floors[name]);
      l.forEach((f, k) => expect(r[k].roll + f.roll).toBe(0));
      // Classic poses roll by about .69 of hero (.55 rad against .8 at full reach).
      expect(Math.abs(peak(left, { hero: 0 }) / top - .69), name).toBeLessThan(.05);
    }
  });
  it('stays within the reach, is exactly 0 in straight flight and gone 2 s after the travel straightens', () => {
    for (const [name, left] of DEVICES) for (const hero of [0, 1]) for (const speed of [8, 13, 34]) {
      const reach = hero ? ROLL.hero : ROLL.classic, device = left.rate ? { ...left, speed } : left;
      drive(device, { hero }, f => expect(Math.abs(f.roll), name).toBeLessThanOrEqual(reach));
    }
    drive(keyboard(34), { seconds: 6 }, f => {
      if (f.t <= 1) expect(f.roll).toBe(0);
      // The turn ends at 3 s; the velocity catches up with the view within a few tenths of a second.
      if (f.t >= 5.4) expect(Math.abs(f.roll)).toBeLessThan(.05 * ROLL.hero);
    });
  });
  it('matches 60 Hz at 30-165 Hz, without ripple in a steady turn and without a step in the roll rate', () => {
    for (const [name, device] of DEVICES) {
      const base = peak(device);
      for (const hz of RATES) {
        expect(Math.abs(peak(device, { hz }) - base), `${name} ${hz} Hz`).toBeLessThan(.01);
        const s = smoothness(device, hz); expect(s.fastest).toBeLessThan(6); expect(s.jolt, `${name} ${hz} Hz`).toBeLessThan(1.5);
      }
    }
    for (const device of [keyboard(13), keyboard(34), edge(8)]) for (const hz of [60, ...RATES]) {
      const steady = rolls(device, { hz }).filter(f => f.t > 2.4 && f.t < 3).map(f => f.roll);
      expect(Math.max(...steady) - Math.min(...steady)).toBeLessThan(.01);
    }
  });
  it('does not roll while hovering, strafing, flying backward, setting off, or on foot', () => {
    const hover = { speed: 0, pointer: false, forward: 0, rate: () => 1.5 };
    expect(Math.abs(peak(hover))).toBeLessThan(.05);
    // A strafe from a hover: the travel runs sideways to the body, straight (circling while strafing does bank; see DECISIONS.md).
    const still = { step: (b: { t: number; v: { x: number; y: number; z: number } }) => { if (b.t < 1) b.v = { x: 0, y: 0, z: 0 }; } };
    for (const strafe of [1, -1]) expect(Math.abs(peak({ speed: 0, pointer: false, forward: 0, strafe }, still))).toBeLessThan(.05);
    expect(Math.abs(peak({ ...keyboard(13), forward: -1 }))).toBeLessThan(.05);
    // Spinning in place, then setting off straight ahead: the stale travel heading is re-seeded, not carved in one frame.
    let setOff = 0;
    drive({ speed: 0, pointer: false, rate: t => t < 2 ? 1.5 : 0, forward: 1 }, { seconds: 4, step: b => { if (b.t < 2) b.v = { x: 0, y: 0, z: 0 }; } },
      f => { if (f.t >= 2) setOff = Math.max(setOff, Math.abs(f.roll)); });
    expect(setOff).toBeLessThan(.02);
    // Below walking pace the roll fades out: a slow drift turn barely tips the body.
    expect(Math.abs(peak(edge(3)))).toBeLessThan(.05);
    // On foot the roll is exactly 0, however the walk curves, even before the flight weight has settled after a touchdown.
    const r = createSuitRoll(), p = { ...flightPose({ speed: 5, flight: 1 }), epoch: 0 }, walk = createTurnSweep();
    for (let i = 0; i < 240; i++) {
      const yaw = i * 1.5 / 60, from = { x: -Math.sin(yaw - .025) * 5, y: 0, z: -Math.cos(yaw - .025) * 5 }, velocity = { x: -Math.sin(yaw) * 5, y: 0, z: -Math.cos(yaw) * 5 };
      p.yaw = yaw; sweepTurn(walk, from, velocity, velocity, yaw, 1 / 60);
      expect(advanceSuitRoll(r, p, { paused: false, reduced: false, flying: false, velocity, turn: walk }, 1, 0, 1 / 60)).toBe(0);
    }
  });
  it('reduced motion removes it: 0 from the start, and eased out without a step when switched on mid-turn', () => {
    drive(keyboard(34), { reduced: () => true }, f => expect(f.roll).toBe(0));
    let previous = 0;
    drive(keyboard(34), { reduced: t => t >= 2 }, f => {
      expect(Math.abs(f.roll - previous) * 60).toBeLessThan(6); previous = f.roll;
      if (f.t >= 3) expect(Math.abs(f.roll)).toBeLessThan(.02);
    });
    expect(smoothness(keyboard(34), 60, { reduced: t => t >= 2 }).jolt).toBeLessThan(1.5);
  });
  it('restarts upright on a teleport or reset, holds while paused and restarts cleanly on resume', () => {
    const p = { ...flightPose({ speed: 13 }), epoch: 0 }, r = createSuitRoll(), input = { paused: false, reduced: false, flying: true, velocity: { x: 0, y: 0, z: -13 }, turn: createTurnSweep() };
    const turn = (frames: number) => { for (let i = 0; i < frames; i++) {
      const yaw = Math.atan2(-input.velocity.x, -input.velocity.z) + 1.5 / 60, from = input.velocity; p.yaw = yaw;
      input.velocity = { x: -Math.sin(yaw) * 13, y: 0, z: -Math.cos(yaw) * 13 }; sweepTurn(input.turn, from, input.velocity, input.velocity, yaw, 1 / 60);
      advanceSuitRoll(r, p, input, 1, 0, 1 / 60);
    } return r.angle; };
    expect(turn(90)).toBeGreaterThan(.5);
    p.epoch = 1; expect(advanceSuitRoll(r, p, input, 1, 0, 1 / 60)).toBe(0);
    const held = turn(90); input.paused = true;
    for (let i = 0; i < 30; i++) expect(advanceSuitRoll(r, p, input, 1, 0, 1 / 60)).toBe(held);
    input.paused = false; expect(advanceSuitRoll(r, p, input, 1, 0, 1 / 60)).toBe(0);
    expect(turn(1)).toBeLessThan(.02);
  });
  // The controller's slide (removeInward) turning the velocity 45 degrees in one step; the view is turned too, so only the deflection
  // is measured. suit-roll-world.test.ts flies the flight safety's own bend along a facade with the view held still.
  it('barely rolls when a wall turns the velocity 45 degrees at 34 m/s', () => {
    for (const hz of [30, 60, 144]) {
      let hit = false;
      const top = peak({ speed: 34, pointer: false }, { hz, seconds: 3, step: b => {
        if (hit || b.t < 1) return; hit = true;
        const c = Math.cos(Math.PI / 4), s = Math.sin(Math.PI / 4); b.v = { x: b.v.x * c + b.v.z * s, y: b.v.y, z: -b.v.x * s + b.v.z * c }; b.yaw += Math.PI / 4;
      } });
      expect(Math.abs(top)).toBeLessThan(.25);
    }
  });
  it('fades out through touchdown with the soles planted, and never exceeds what the landing flare leaves', () => {
    const r = rig(); let at = 0;
    drive(keyboard(13), { seconds: 3.5, rig: r, step: b => { if (b.t >= 2.5 && b.flying) { b.flying = false; b.v = { x: 0, y: 0, z: 0 }; } } }, f => {
      if (!f.body.flying && !at) at = f.t;
      if (!at) return;
      if (f.t - at >= .4 - 1e-9) expect(Math.abs(f.roll)).toBeLessThan(.05);
      // The plant blends a touchdown's height change out over .15 s (suit-animation.test.ts); the roll adds nothing to it.
      const low = Math.min(...[8, 9].map(i => r.joints[i].localToWorld(new Vector3(0, -.49, 0)).y)), u = Math.min(1, f.life.switched / .15);
      expect(Math.abs(low + 1)).toBeLessThan(.005 + Math.abs(f.life.blend) * (1 - u * u * (3 - 2 * u)));
    });
    drive(keyboard(13), { seconds: 6, step: b => { b.landing = b.t >= 2; } }, f => {
      expect(Math.abs(f.roll)).toBeLessThanOrEqual((1 - f.mix.flare) * ROLL.hero * f.p.flight + 1e-12);
    });
  });
  it('tilts the chest on screen well past the carve alone, as the chase camera sees it', () => {
    for (const [speed, floor] of [[13, 20], [34, 25]] as const) for (const dir of [1, -1]) {
      const on = rig(), off = rig(); let most = 0;
      drive(keyboard(speed, dir), { pitch: -.12, rig: on }, f => {
        frame(off, f.p, f.mix, f.life, 1, false, true, 0, f.fade);
        most = Math.max(most, (tilt(on, f.p) - tilt(off, f.p)) * dir * 180 / Math.PI);
      });
      if (process.env.ROLL_REPORT) console.log(`visible chest tilt over the carve alone, ${speed} m/s dir ${dir}: ${most.toFixed(1)} deg`);
      expect(most, `${speed} m/s`).toBeGreaterThan(floor);
    }
  });
  it('banks into climbing and diving turns on screen, against straight flight, at 8 and 13 m/s', () => {
    // Held turns 1.8 s in, the chest measured against the same flight before the turn; the camera below in a climb, above in a dive.
    const lines: string[] = [];
    for (const [pitch, speed, floor] of [[.9, 13, 30], [.9, 8, 15], [-.9, 13, 10], [-.9, 8, 1]] as const) for (const dir of [1, -1]) {
      const r = rig(), device = speed === 8 ? edge(8, dir) : keyboard(13, dir); let straight = 0, net = 0;
      drive(device, { pitch, rig: r, seconds: 2.8 }, f => { if (Math.abs(f.t - 1) < 1e-9) straight = tilt(r, f.p); net = (tilt(r, f.p) - straight) * dir * 180 / Math.PI; });
      lines.push(`pitch ${pitch} ${speed} m/s dir ${dir}: ${net.toFixed(1)} deg`); expect(net, lines.at(-1)).toBeGreaterThan(floor);
    }
    if (process.env.ROLL_REPORT) console.log(`net chest tilt into the turn: ${lines.join(' · ')}`);
  });
  it('circling while strafing banks into the curve up to the measured reach, at 13 m/s and at surge', () => {
    // From a hover, strafing right while the view turns right at 1.5 rad/s: the body keeps part of its heading along the travel.
    const still = { seconds: 6, step: (b: { t: number; v: { x: number; y: number; z: number } }) => { if (b.t < 1) b.v = { x: 0, y: 0, z: 0 }; } };
    const circle = (speed: number, pointer: boolean, hero: number) => Math.abs(peak({ speed, pointer, forward: 0, strafe: 1, rate: t => t >= 1 ? -1.5 : 0 }, { ...still, hero }));
    const measured = [circle(13, false, 1), circle(13, false, 0), circle(34, false, 1), circle(34, false, 0), circle(34, true, 1)];
    if (process.env.ROLL_REPORT) console.log(`strafe circle: 13 m/s ${measured[0].toFixed(3)} / ${measured[1].toFixed(3)} classic, 34 m/s ${measured[2].toFixed(3)} / ${measured[3].toFixed(3)}, pointer ${measured[4].toFixed(3)}`);
    [.319, .219, .699, .480, .699].forEach((m, i) => expect(Math.abs(measured[i] - m), `${i}`).toBeLessThan(.01));
  });
});
if (process.env.ROLL_REPORT) {
  const f = (x: number) => x.toFixed(3), lines = DEVICES.map(([name, left]) => {
    const top = peak(left), classic = peak(left, { hero: 0 }), spread = Math.max(...RATES.map(hz => Math.abs(peak(left, { hz }) - top)));
    const worst = RATES.map(hz => smoothness(left, hz)), reach = rolls(left).find(x => x.roll > .3)?.t;
    return `${name}: peak ${f(top)} classic ${f(classic)} ratio ${f(classic / top)} | 30-165 Hz peak spread ${f(spread)} rate ${f(Math.max(...worst.map(w => w.fastest)))} ` +
      `jolt ${f(Math.max(...worst.map(w => w.jolt)))} | .3 reached ${reach === undefined ? '-' : f(reach - 1)} s into the turn`;
  });
  const steady = [keyboard(13), keyboard(34), edge(8)].map(d => Math.max(...[60, ...RATES].map(hz => {
    const s = rolls(d, { hz }).filter(x => x.t > 2.4 && x.t < 3).map(x => x.roll); return Math.max(...s) - Math.min(...s); })));
  const late = rolls(keyboard(34), { seconds: 6 }).filter(x => x.t >= 5.4).reduce((m, x) => Math.max(m, Math.abs(x.roll)), 0);
  console.log([...lines, `steady ripple (kb13, kb34, edge8) ${steady.map(f).join(' ')}`, `2 s after the travel straightens ${f(late)}`].join('\n'));
}
