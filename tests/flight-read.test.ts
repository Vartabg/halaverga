import { describe, expect, it } from 'vitest';
import { landing, play } from './flight-sim';
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
if (process.env.SILHOUETTE_REPORT) console.log(LANDINGS.map(([from, goal]) => { const d = touchdown(from, goal); return `touchdown ${goal.z}: arms on ${d.on.toFixed(1)} off ${d.off.toFixed(1)} deg`; }).join('\n'));
describe('flight states read apart in the chase image', () => {
  it('holds the legs together in cruise and climb (toe tips within .22 m across; the hover stands at hip width, .05 m wider)', () => {
    for (const name of ['cruise 8', 'cruise 13', 'climb 13']) expect(read(name).toes, name).toBeLessThanOrEqual(.22);
    expect(read('hover').toes).toBeGreaterThanOrEqual(read('cruise 8').toes + .05);
  });
  it('hangs the hover arms out and sweeps the cruise arms in behind: at least 25 degrees apart on average', () => {
    for (const name of ['cruise 8', 'cruise 13']) expect(mean(read('hover').arms) - mean(read(name).arms), name).toBeGreaterThanOrEqual(25);
  });
  it('keeps the classic power arrow tight: each arm within 10 degrees of the body', () => {
    for (const a of read('power classic 34').arms) expect(Math.abs(a)).toBeLessThanOrEqual(10);
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
});
