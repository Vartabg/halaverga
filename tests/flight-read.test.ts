import { describe, expect, it } from 'vitest';
import { advanceVelocity, type Vec } from '../src/game/motion';
import { landing, play, type Step } from './flight-sim';
import { readOf, STATES, silhouette } from './flight-silhouette';
/**
 * The read of each flight state in the chase image, beyond how far the tips move: arm angles against the torso (degrees, outward
 * positive), lateral toe spread (m) and the hero fist's distance from the head (head radii). See `readOf`. The chase camera sits .85 m
 * right of the explorer, so the right arm reads a few degrees further out than the left in the same pose.
 */
const results = new Map(STATES.map(s => [s.name, silhouette(s)]));
const read = (name: string) => results.get(name)!.read;
const mean = (arms: [number, number]) => (arms[0] + arms[1]) / 2;
/** Landings Player.tsx flies (as in flight-motion.test.ts): short, down and forward, and long and to the side. */
const LANDINGS = [[{ x: 0, y: 22.5, z: 0 }, { x: 0, y: 21.06, z: -1 }], [{ x: 0, y: 25, z: 0 }, { x: 0, y: 21.06, z: -8 }],
  [{ x: 0, y: 30, z: 0 }, { x: 5, y: 21.06, z: -20 }]] as const;
/** The widest image arm angle of either arm from .25 s before touchdown to .6 s after, clips on and clips off. */
function touchdown(from: typeof LANDINGS[number][0], goal: typeof LANDINGS[number][1]) {
  const frames: { t: number; on: number; off: number }[] = []; let at = Infinity;
  play(9, 60, landing(from, goal), s => {
    if (!s.life.flying && at === Infinity) at = s.t;
    frames.push({ t: s.t, on: Math.max(...readOf(s.clips, s.p).arms), off: Math.max(...readOf(s.legacy, s.p).arms) });
  });
  const window = frames.filter(f => f.t >= at - .25 && f.t <= at + .6);
  return { on: Math.max(...window.map(f => f.on)), off: Math.max(...window.map(f => f.off)) };
}
/** Arm reads through a run: the widest arm per frame, clips on and off, from `from` to `to` seconds. */
function arms(drive: (t: number, dt: number) => Step, from: number, to: number) {
  const on: number[] = [], off: number[] = [];
  play(to, 60, drive, s => { if (s.t >= from) { on.push(Math.max(...readOf(s.clips, s.p).arms)); off.push(Math.max(...readOf(s.legacy, s.p).arms)); } });
  return { on, off, step: Math.max(...on.slice(1).map((a, k) => Math.abs(a - on[k]))) };
}
/** Cruise at 8 m/s straight into the ground, no landing approach, touching down at 3 s. */
const unassisted = (t: number): Step => t < 3 ? { velocity: { x: 0, y: -1, z: -8 }, flying: true } : { velocity: { x: 0, y: 0, z: 0 }, flying: false };
/** A gentle stop out of a 4 m/s drift while the view turns left and pitches down .5 (the camera above), releasing at 3 s. */
function drift(): (t: number) => Step {
  let v: Vec = { x: 0, y: 0, z: 0 }, yaw = 0;
  return t => { const r = t - 3, pitch = r > 0 ? -.5 : 0; yaw += (r > -.3 ? 1.5 : 0) / 60;
    v = advanceVelocity(v, { forward: r < 0 ? .4 : 0, strafe: 0, vertical: 0 }, yaw, pitch, true, false, 1 / 60); return { velocity: v, flying: true, yaw, pitch }; };
}
if (process.env.SILHOUETTE_REPORT) {
  const td = arms(unassisted, 2.9, 3.8), low = arms(drift(), 3, 4.6);
  console.log(`unassisted touchdown: widest arm step ${td.step.toFixed(2)} deg/frame, peak on ${Math.max(...td.on).toFixed(1)} off ${Math.max(...td.off).toFixed(1)}`);
  console.log(`drift stop: widest arm on ${Math.max(...low.on).toFixed(1)} off ${Math.max(...low.off).toFixed(1)}`);
}
if (process.env.SILHOUETTE_REPORT) console.log(LANDINGS.map(([from, goal]) => { const d = touchdown(from, goal); return `touchdown ${goal.z}: arms on ${d.on.toFixed(1)} off ${d.off.toFixed(1)} deg`; }).join('\n'));
describe('flight states read apart in the chase image', () => {
  it('holds the legs together in cruise and climb (toe tips within .22 m across; the hover stands at hip width, .05 m wider)', () => {
    for (const name of ['cruise 8', 'cruise 13', 'climb 13']) expect(read(name).toes, name).toBeLessThanOrEqual(.22);
    expect(read('hover').toes).toBeGreaterThanOrEqual(read('cruise 8').toes + .05);
  });
  it('hangs the hover arms out and sweeps the cruise arms in behind: at least 25 degrees apart on average', () => {
    for (const name of ['cruise 8', 'cruise 13']) expect(mean(read('hover').arms) - mean(read(name).arms), name).toBeGreaterThanOrEqual(25);
  });
  it('keeps the classic power arrow and the hero trailing arm tight: each within 10 degrees of the body', () => {
    for (const a of read('power classic 34').arms) expect(Math.abs(a)).toBeLessThanOrEqual(10);
    expect(Math.abs(read('power hero 34').arms[1])).toBeLessThanOrEqual(10);
  });
  it('swings the legs together through a turn: toe tips within .22 m across, as in straight flight', () => {
    // At power speed the legs hold the straight line; at 13 m/s both thighs swing to the outside of the turn together.
    for (const name of ['left turn 13', 'right turn 13', 'left turn 34', 'right turn 34', 'left turn 34 classic', 'right turn 34 classic'])
      expect(read(name).toes, name).toBeLessThanOrEqual(.22);
  });
  it('keeps the outside arm of a turn along the body: at most 6 degrees further out than in straight flight', () => {
    // Left turns: the right arm is outside; right turns: the left arm. The hero right arm holds the fist.
    expect(read('left turn 34 classic').arms[0]).toBeLessThanOrEqual(read('power classic 34').arms[0] + 6);
    expect(read('right turn 34 classic').arms[1]).toBeLessThanOrEqual(read('power classic 34').arms[1] + 6);
    expect(read('right turn 34').arms[1]).toBeLessThanOrEqual(read('power hero 34').arms[1] + 6);
  });
  it('keeps the hero fist off the head in a left turn: at least 2 head radii from its centre in the image at every frame', () => {
    // Two radii put the fist centre one head radius clear of the outline, about the fist's own width.
    expect(results.get('left turn 34')!.fistMin).toBeGreaterThanOrEqual(2);
  });
  it('lets the landing flare carry through touchdown without flapping the arms out: under 45 degrees and under clips-off', () => {
    for (const [from, goal] of LANDINGS) { const d = touchdown(from, goal); expect(d.on).toBeLessThan(45); expect(d.on).toBeLessThan(d.off); }
  });
  it('eases the arms out of the cruise sweep on an unassisted touchdown: at most 4 degrees a frame, peak under clips-off', () => {
    // Clips off the living layer's impact reaction swings the arms about 16 degrees in a frame; the cruise sweep starts further in.
    const d = arms(unassisted, 2.9, 3.8);
    expect(d.step).toBeLessThanOrEqual(4); expect(Math.max(...d.on)).toBeLessThan(Math.max(...d.off));
  });
  it('keeps the arms off a sideways signal when stopping out of a slow drift under a camera above: widest arm at most 55 degrees', () => {
    // The hover arms read about 45-50 degrees from above; a partial brake reach blended in held the outside arm out at about 76.
    expect(Math.max(...arms(drift(), 3, 4.6).on)).toBeLessThanOrEqual(55);
  });
});
