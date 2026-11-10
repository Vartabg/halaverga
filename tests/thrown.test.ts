import { describe, expect, it } from 'vitest';
import { createShooter, mulberry32 } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { createBanish, resetBanish } from '../src/game/banish';
import { CUTS, launch, powerOf } from '../src/game/swordString';
import { THROWN, floorAt, reelDemon, spikeDemon, stepBody } from '../src/game/thrown';

const fly = (p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, seconds: number, gravity: number = THROWN.gravity, drag = 0) => {
  let hardest = 0, hits = 0;
  for (let n = 0; n < Math.ceil(seconds * 60); n++) { const hit = stepBody(p, v, 1 / 60, gravity, drag); if (hit) { hits++; hardest = Math.max(hardest, hit.speed); } }
  return { hardest, hits };
};
describe('a thrown body', () => {
  it('falls under gravity: about half g t squared, with no drag', () => {
    const p = { x: 0, y: 100, z: 0 }, v = { x: 0, y: 0, z: 0 };
    fly(p, v, 1); expect(100 - p.y).toBeCloseTo(THROWN.gravity / 2, 0); expect(v.y).toBeCloseTo(-THROWN.gravity, 1);
  });
  it('loses speed to the air, and a light gravity lets it hang', () => {
    const p = { x: 0, y: 100, z: 0 }, v = { x: 20, y: 0, z: 0 };
    fly(p, v, 1, 0, THROWN.drag); expect(v.x).toBeCloseTo(20 * Math.exp(-THROWN.drag), 2);
    const up = { x: 0, y: 100, z: 0 }, w = { x: 0, y: 17, z: 0 }; let apex = 0;
    for (let n = 0; n < 120; n++) { stepBody(up, w, 1 / 60, THROWN.gravity * THROWN.float, THROWN.drag); apex = Math.max(apex, up.y - 100); }
    expect(apex).toBeGreaterThan(4.5); expect(apex).toBeLessThan(8); // the rising cut's launch: high enough to follow, low enough to reach
  });
  it('strikes the water and bounces back with less than it came with', () => {
    const p = { x: 0, y: 30, z: 0 }, v = { x: 6, y: -50, z: 0 }; // the gorge floor at x 0 is under water
    const { hardest } = fly(p, v, .7);
    expect(hardest).toBeGreaterThan(45); expect(p.y).toBeGreaterThanOrEqual(floorAt(p.x, p.z) + THROWN.radius - 1e-6);
    const q = { x: 0, y: floorAt(0, 0) + THROWN.radius + .01, z: 0 }, down = { x: 0, y: -20, z: 0 };
    stepBody(q, down, 1 / 60, 0, 0); expect(down.y).toBeGreaterThan(0); expect(down.y).toBeLessThan(20 * THROWN.bounce + .5);
  });
  it('stops against a cliff face instead of passing through it or riding up onto its top', () => {
    // The summit terrace stands 61 m high from x 7 to 53 at z -40; the gorge beside it is at the water.
    expect(floorAt(20, -40)).toBeGreaterThan(55); expect(floorAt(0, -40)).toBeLessThan(3);
    const p = { x: 0, y: 30, z: -40 }, v = { x: 70, y: 0, z: 0 };
    const { hardest } = fly(p, v, .6, 0, 0);
    expect(hardest).toBeGreaterThan(30); // it hit the wall hard
    expect(p.x).toBeLessThan(16); expect(p.y).toBeLessThan(40); // still outside the rock, still at the height it flew at
    expect(v.x).toBeLessThan(0); // and thrown back off the face
  });
  it('never ends below the ground or with a broken number, whatever it is thrown at', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 300; n++) {
      const p = { x: -200 + rng() * 400, y: 0, z: -200 + rng() * 320 }; p.y = floorAt(p.x, p.z) + 2 + rng() * 60;
      const v = { x: (rng() - .5) * 180, y: (rng() - .7) * 140, z: (rng() - .5) * 180 };
      fly(p, v, 1.5, THROWN.gravity, THROWN.spikeDrag);
      for (const c of [p.x, p.y, p.z, v.x, v.y, v.z]) expect(Number.isFinite(c)).toBe(true);
      // A body stopped against a cliff may sit within a stride of the face; it is never deep inside the mountain.
      expect(floorAt(p.x, p.z) + THROWN.radius - p.y, `throw ${n}`).toBeLessThan(THROWN.wall + .01);
    }
  });
});
describe('a demon the sword has thrown', () => {
  const setup = () => { const s = createShooter(); createDroneSim(s); buildTargets(s); const b = createBanish(); resetBanish(b, s); return { s, b }; };
  it('flies harder the faster the angel arrived', () => {
    const { b } = setup(), dir = { x: 0, y: 0, z: -1 };
    launch(b, 0, dir, CUTS[0], powerOf(55)); const slow = Math.hypot(b.vel[0].x, b.vel[0].z);
    launch(b, 0, dir, CUTS[0], powerOf(130)); const fast = Math.hypot(b.vel[0].x, b.vel[0].z);
    expect(fast).toBeGreaterThan(slow * 1.5); expect(powerOf(0)).toBe(.75); expect(powerOf(1000)).toBe(1.35);
    launch(b, 0, dir, CUTS[1], 1); expect(b.vel[0].y).toBeGreaterThan(15); // the rising cut lifts
    launch(b, 0, dir, CUTS[2], 1); // the casting blow drives it forward and down, tumbling, away from the angel
    expect(b.vel[0].y).toBeLessThan(-25); expect(b.vel[0].z).toBeLessThan(-50); expect(b.spin[0]).not.toBe(0);
    launch(b, 0, { x: 0, y: -1, z: 0 }, CUTS[2], 1); expect(Math.hypot(b.vel[0].x, b.vel[0].z)).toBe(0); // from straight above: straight down
  });
  it('shoves a demon in its path once, and loses part of its own speed doing it', () => {
    const { s, b } = setup(), f = s.drones;
    Object.assign(f.pos[0], { x: 0, y: 60, z: 0 }); Object.assign(f.pos[1], { x: 0, y: 59, z: -1.2 });
    b.wounds[0] = 1; Object.assign(b.vel[0], { x: 0, y: 0, z: -30 });
    const hit = reelDemon(b, s, 0, 1 / 60)!;
    expect(hit.other).toBe(1); expect(f.knockV[1].z).toBeLessThan(-8); expect(Math.abs(b.vel[0].z)).toBeLessThan(21);
    const after = f.knockV[1].z; Object.assign(f.pos[0], { x: 0, y: 60, z: 0 });
    expect(reelDemon(b, s, 0, 1 / 60)).toBeNull(); expect(f.knockV[1].z).toBe(after); // once per throw
    f.held[1] = 1; b.struck[0] = 0; expect(reelDemon(b, s, 0, 1 / 60)).toBeNull(); // a demon already in a string is left alone
  });
  it('tumbles while it is cast down and reverses its tumble where it strikes', () => {
    const { s, b } = setup(), f = s.drones;
    Object.assign(f.pos[0], { x: 0, y: 12, z: 0 }); launch(b, 0, { x: 0, y: -1, z: 0 }, CUTS[2], 1);
    const spin = b.spin[0], tilt = f.tiltX[0]; let hit = null;
    for (let n = 0; n < 40 && !hit; n++) hit = spikeDemon(b, s, 0, 1 / 60);
    expect(f.tiltX[0]).not.toBe(tilt); expect(hit).not.toBeNull(); expect(Math.sign(b.spin[0])).toBe(-Math.sign(spin));
  });
});
