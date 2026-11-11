import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WATER_LEVEL, createShooter, mulberry32 } from '../src/game/combat';
import { buildTargets, createDroneSim } from '../src/game/drones';
import { FX, MODE, createBanish, resetBanish, stepBanish } from '../src/game/banish';
import { resetBattle } from '../src/game/celestialBattle';
import { SOLID, obstacleCount, setObstacles, strikeObstacle, type Stone } from '../src/game/obstacles';
import { THROWN, floorAt, stepBody } from '../src/game/thrown';
import { ARCH, archSection } from '../src/world/archData';
import { makeCity } from '../src/world/cityData';
import { STONE_FIT } from '../src/world/kit';
import { megalithGeometry } from '../src/world/megalithGeometry';
import { slamSurface } from '../src/world/fxSlam';

let city: ReturnType<typeof makeCity>, stones: Stone[];
beforeAll(() => { city = makeCity(); stones = city.stones; });
afterEach(() => setObstacles([], false));
const R = THROWN.radius;
const fly = (p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, seconds: number, gravity = 0) => {
  let hardest = 0, normal = { nx: 0, ny: 0, nz: 0 }, at = { x: 0, y: 0, z: 0 };
  for (let n = 0; n < Math.ceil(seconds * 60); n++) {
    const hit = stepBody(p, v, 1 / 60, gravity, 0);
    if (hit && hit.speed > hardest) { hardest = hit.speed; normal = { nx: hit.nx, ny: hit.ny, nz: hit.nz }; at = { x: hit.x, y: hit.y, z: hit.z }; }
  }
  return { hardest, normal, at };
};
/** How far outside a stone's skin the ball's surface is (negative: inside it). */
const clear = (s: Stone, p: { x: number; y: number; z: number }) => {
  const foot = s.y - s.h / 2, head = foot + s.h;
  if (p.y < foot - R || p.y > head + R) return 1;
  const t = Math.min(1, Math.max(0, (p.y - foot) / s.h)), d = Math.hypot(p.x - s.x, p.z - s.z);
  if (p.y > head && d > s.top) return Math.hypot(d - s.top, p.y - head) - R; // beyond the rim of its head, which is round to a ball
  return Math.max(d - (s.bottom + (s.top - s.bottom) * t + R), p.y - head - R);
};
const archClear = (p: { x: number; y: number; z: number }) => {
  if (p.x <= ARCH.x0 || p.x >= ARCH.x1) return 1;
  const s = archSection((p.x - ARCH.x0) / (ARCH.x1 - ARCH.x0)), edge = Math.min(p.x - ARCH.x0, ARCH.x1 - p.x);
  const cap = edge >= SOLID.cap ? 1 : Math.sqrt(1 - (1 - edge / SOLID.cap) ** 2); // its ends are rounded off
  return cap < 1e-3 ? 1 : Math.hypot((p.y - s.cy) / ((s.ry + R) * cap), (p.z - s.cz) / ((s.rz + R) * cap)) - 1;
};
const SEEDS = (process.env.OBSTACLE_SEEDS ?? '19,1,2,3,5,8,13,17').split(',').map(Number);
const west = () => stones.find(s => s.x === -24 && s.z === 48 && s.h === 24)!;
// East of the west megalith the gorge water lies open (x -14 to -10 at z 48); west of it the mountain climbs past 14 m.
const FROM = { x: -12, y: 14, z: 48 };

describe('the stones a thrown body can strike are the stones that are drawn', () => {
  it('records every megalith the city builds, with the arrival pair at full height', () => {
    expect(stones.length).toBeGreaterThan(20);
    for (const s of stones) for (const c of [s.x, s.y, s.z, s.h, s.top, s.bottom]) expect(Number.isFinite(c)).toBe(true);
    for (const s of stones) { expect(s.h).toBeGreaterThan(0); expect(s.top).toBeGreaterThan(0); expect(s.bottom).toBeGreaterThanOrEqual(s.top); }
    const w = west(), e = stones.find(s => s.x === 24 && s.z === 48 && s.h === 26)!;
    expect(w).toBeDefined(); expect(e).toBeDefined();
    expect(w.bottom).toBeCloseTo(2.6 * 1.18 * STONE_FIT, 5); expect(w.top).toBeCloseTo(2.6 * .62 * STONE_FIT, 5); expect(w.y - w.h / 2).toBeCloseTo(2.05, 5);
  });
  it('fits the collider to the stone as drawn: inside the circle its corners stand on, outside the flats between them', () => {
    // The west megalith's own mesh, before the kit flutes it: how far its corners stand from the axis, against the plain cone.
    const g = megalithGeometry(24, 2.6 * .62, 2.6 * 1.18, 11), q = g.attributes.position; let sum = 0, n = 0;
    for (let i = 0; i < q.count; i++) {
      const rad = Math.hypot(q.getX(i), q.getZ(i)); if (rad < 1e-3) continue; // the two cap centres
      const t = (q.getY(i) + 12) / 24; if (t > .98) continue;                  // the head ring is ragged on purpose
      sum += rad / (2.6 * 1.18 + (2.6 * .62 - 2.6 * 1.18) * t); n++;
    }
    const corners = sum / n, flats = corners * Math.cos(Math.PI / 7);
    expect(corners).toBeGreaterThan(.95); expect(corners).toBeLessThan(1.05);
    expect(STONE_FIT).toBeLessThan(corners); expect(STONE_FIT).toBeGreaterThan(flats); // between the corners and the flats
    g.dispose();
  });
  it('is handed to the game by the mountain when it mounts, and taken away when it unmounts', () => {
    const src = readFileSync(new URL('../src/world/HermonCity.tsx', import.meta.url), 'utf8');
    expect(src).toContain('useEffect(() => { setObstacles(city.stones, true); return () => setObstacles([], false); }, [city]);');
    expect(readFileSync(new URL('../src/world/kit.ts', import.meta.url), 'utf8')).toContain('stones.push({ x, y, z, h, top: rTop * STONE_FIT, bottom: rBot * STONE_FIT });');
    expect(readFileSync(new URL('../src/world/Scene.tsx', import.meta.url), 'utf8')).toContain("import City from './HermonCity';");
    expect(obstacleCount()).toBe(0); setObstacles(stones, true); expect(obstacleCount()).toBe(stones.length + 1);
  });
  it('draws the arch from the same section the collider uses', () => {
    expect(readFileSync(new URL('../src/world/hermonArch.ts', import.meta.url), 'utf8')).toContain('s = archSection(t)');
    const p = city.terrains.find(t => t.id === 'cloven-arch')!.geometry.attributes.position; let seen = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); if (x < ARCH.x0 + 1 || x > ARCH.x1 - 1) continue; // the end rings carry the mesh's sideways jitter past the span
      const s = archSection((x - ARCH.x0) / (ARCH.x1 - ARCH.x0)), e = Math.hypot((p.getY(i) - s.cy) / s.ry, (p.getZ(i) - s.cz) / s.rz);
      expect(e).toBeGreaterThan(.7); expect(e).toBeLessThan(1.3); seen++; // every vertex of the rock lies on the collider's skin, give or take its chipping
    }
    expect(seen).toBeGreaterThan(100);
  });
});
describe('a thrown body and the standing stones', () => {
  it('passes where a stone stands until the mountain is mounted', () => {
    const p = { ...FROM }, v = { x: -60, y: 0, z: 0 };
    const { hardest } = fly(p, v, .3); expect(hardest).toBe(0); expect(p.x).toBeLessThan(-28);
  });
  it('strikes the side of the west megalith, stops at its face and is thrown back', () => {
    setObstacles(stones, true);
    const w = west(), p = { ...FROM }, v = { x: -60, y: 0, z: 0 };
    const { hardest, normal, at } = fly(p, v, .3);
    expect(hardest).toBeGreaterThan(50); expect(normal.nx).toBeGreaterThan(.99); expect(normal.ny).toBeGreaterThan(0); expect(normal.ny).toBeLessThan(.1); // the face leans back a little as the stone narrows
    expect(v.x).toBeGreaterThan(0); expect(p.x).toBeGreaterThan(w.x + w.top + R - 1e-6); // outside the stone, on the side it came from
    const t = (14 - 2.05) / 24, skin = w.bottom + (w.top - w.bottom) * t;
    expect(at.x).toBeCloseTo(w.x + skin, 1); expect(at.y).toBeCloseTo(14, 0); // the contact is on the stone's face, not at the body's centre
  });
  it('glances off when it clips the edge of a stone, turned aside and not stopped dead', () => {
    setObstacles(stones, true);
    const p = { ...FROM, z: FROM.z + 2.8 }, v = { x: -60, y: 0, z: 0 }; // the stone is 2.3 m thick at this height: the ball's edge catches it
    const { hardest } = fly(p, v, .3);
    expect(hardest).toBeGreaterThan(5); expect(v.z).toBeGreaterThan(1); expect(v.x).toBeLessThan(-5); // deflected outward, still travelling on
  });
  it('lands on top of a stone it is dropped onto', () => {
    setObstacles(stones, true);
    const crown = stones.find(s => s.x === -24 && s.z === 48 && s.h === 3.8)!, w = crown; // the megalith carries a crown stone on its head
    expect(crown.y - crown.h / 2).toBeCloseTo(west().y + west().h / 2, 5);
    const head = w.y + w.h / 2, p = { x: w.x, y: head + 8, z: w.z }, v = { x: 0, y: -25, z: 0 };
    const { hardest, normal, at } = fly(p, v, .5);
    expect(hardest).toBeGreaterThan(20); expect(normal.ny).toBe(1); expect(at.y).toBeCloseTo(head, 5);
    expect(p.y).toBeGreaterThanOrEqual(head + R - 1e-6);
  });
  it('rounds the rim of a stone: a body that clips it is turned off it, and one that falls past it is not held up by air', () => {
    setObstacles(stones, true);
    const crown = stones.find(s => s.x === -24 && s.z === 48 && s.h === 3.8)!, head = crown.y + crown.h / 2;
    const clip = { x: crown.x + crown.top + .5, y: head + 6, z: crown.z }, down = { x: 0, y: -25, z: 0 };
    const a = fly(clip, down, .4);
    expect(a.hardest).toBeGreaterThan(5); expect(a.normal.nx).toBeGreaterThan(.3); expect(a.normal.ny).toBeGreaterThan(.3); // off the edge: outward and up
    expect(down.x).toBeGreaterThan(1); // thrown clear of the stone, not left standing on its edge
    const past = { x: crown.x + crown.top + R + .15, y: head + 2, z: crown.z }, fall = { x: 0, y: -25, z: 0 };
    stepBody(past, fall, 1 / 60, 0, 0); stepBody(past, fall, 1 / 60, 0, 0); stepBody(past, fall, 1 / 60, 0, 0);
    expect(past.y).toBeLessThan(head + 1); expect(fall.y).toBe(-25); // it went by
  });
  it('feels the lean of a low stone: a body that falls onto a waystone\'s flank strikes it', () => {
    setObstacles(stones, true);
    const way = stones.find(s => s.x === -24 && s.z === 45)!, head = way.y + way.h / 2;
    const p = { x: way.x, y: head + 3, z: way.z - way.top - R - .2 }, v = { x: 0, y: -25, z: 0 }; // just past its rim, on the side away from the megalith
    const { hardest, normal } = fly(p, v, .2);
    expect(hardest).toBeGreaterThan(3); expect(normal.ny).toBeGreaterThan(.15); expect(normal.nz).toBeLessThan(-.9); expect(v.z).toBeLessThan(0);
  });
  it('lets out a body that begins deep inside a stone, where no flight could have put it, and does not throw it out', () => {
    setObstacles(stones, true);
    const w = west(), p = { x: w.x, y: 14, z: w.z }, v = { x: 30, y: 0, z: 0 };
    stepBody(p, v, 1 / 60, 0, 0);
    expect(p.x).toBeCloseTo(w.x + .5, 5); expect(v.x).toBe(30); // it moved on at its own speed
    for (let n = 0; n < 12; n++) { const before = p.x; stepBody(p, v, 1 / 60, 0, 0); expect(Math.abs(p.x - before)).toBeLessThan(1.6); } // and leaves without a jump
    expect(clear(w, p)).toBeGreaterThan(-1e-6);
  });
  it('meets the foot of the arch as a slope: a body sliding along the bank across its end is not thrown up a step', () => {
    setObstacles(stones, true);
    for (const z of [-1, -3, 1.5]) {
      const p = { x: ARCH.x0 - 3, y: 0, z }, v = { x: 10, y: 0, z: 0 }; p.y = floorAt(p.x, p.z) + R;
      let jump = 0;
      for (let n = 0; n < 60; n++) { const y = p.y, x = p.x; stepBody(p, v, 1 / 60, THROWN.gravity, 0); if (p.x > x + .01) jump = Math.max(jump, (p.y - y) / (p.x - x)); }
      expect(jump, `z ${z}`).toBeLessThan(4); // no wall: the steepest it climbs is a steep ramp, never a 1.5 m lift in one frame
    }
  });
  it('strikes the arch from above and from the side, and passes clean under its crown', () => {
    setObstacles(stones, true);
    const crown = archSection(.5), top = { x: 0, y: 30, z: crown.cz }, down = { x: 0, y: -30, z: 0 };
    const a = fly(top, down, .6);
    expect(a.hardest).toBeGreaterThan(25); expect(a.normal.ny).toBeGreaterThan(.99); expect(top.y).toBeGreaterThanOrEqual(crown.cy + crown.ry + R - 1e-6);
    const side = { x: 0, y: crown.cy, z: 20 }, along = { x: 0, y: 0, z: -60 };
    const b = fly(side, along, .4);
    expect(b.hardest).toBeGreaterThan(50); expect(b.normal.nz).toBeGreaterThan(.99); expect(along.z).toBeGreaterThan(0); expect(side.z).toBeGreaterThan(crown.cz + crown.rz);
    const under = { x: 0, y: 4, z: 20 }, through = { x: 0, y: 0, z: -60 };
    const c = fly(under, through, .6);
    expect(c.hardest).toBe(0); expect(under.z).toBeLessThan(-12); // the gorge under the arch stays open
    // Near a foot the arch climbs steeply: its skin leans along the span, so a body dropped there is thrown outward, not straight up.
    const foot = { x: -24, y: 30, z: -1 }, drop = { x: 0, y: -30, z: 0 };
    const d = fly(foot, drop, .9); expect(d.hardest).toBeGreaterThan(20); expect(d.normal.nx).toBeLessThan(-.1);
  });
  it('never ends inside a stone, inside the arch, under the ground or with a broken number, whatever it is thrown at', () => {
    setObstacles(stones, true);
    const near = stones.filter(s => Math.abs(s.x) < 60 && s.z > -90 && s.z < 80);
    // Seed 19 is the first one this was built against; the independent review replayed 25 seeds and 17 failed (the notch between
    // the tablet and its witness stones, the arch's underside against its bank), so several are kept.
    for (const seed of SEEDS) { const rng = mulberry32(seed);
    for (let n = 0; n < 160; n++) {
      // Half the throws start near a stone or the arch and are aimed at it; the rest go anywhere over the near mountain.
      const s = near[n % near.length], aimed = n % 2 === 0, arch = n % 8 === 0;
      const target = arch ? { x: -28 + rng() * 56, y: 4 + rng() * 10, z: -1 } : { x: s.x, y: s.y - s.h / 2 + rng() * (s.h + 2), z: s.z };
      const p = aimed ? { x: target.x + (rng() - .5) * 50, y: target.y + rng() * 25, z: target.z + (rng() - .5) * 50 } : { x: -60 + rng() * 120, y: 0, z: -90 + rng() * 170 };
      if (!aimed) p.y = floorAt(p.x, p.z) + 2 + rng() * 50; else p.y = Math.max(p.y, floorAt(p.x, p.z) + 2);
      if (stones.some(q => clear(q, p) < 0) || archClear(p) < 0) continue; // a throw cannot start inside the rock
      const k = 40 + rng() * 90, dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, l = Math.hypot(dx, dy, dz) || 1;
      const v = aimed ? { x: dx / l * k, y: dy / l * k, z: dz / l * k } : { x: (rng() - .5) * 180, y: (rng() - .7) * 140, z: (rng() - .5) * 180 };
      for (let step = 0; step < 90; step++) {
        stepBody(p, v, 1 / 60, THROWN.gravity, THROWN.spikeDrag);
        // The least room it has to anything: a stone, the arch, the ground. Throw 372 found a ball left inside a crown stone
        // because the shaft under it kept answering (2026-11-10).
        let room = Math.min(archClear(p), p.y - R - floorAt(p.x, p.z)), what = 'arch or ground';
        for (const q of stones) { const c = clear(q, p); if (c < room) { room = c; what = `stone ${q.x},${q.z} h${q.h}`; } }
        if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) room = NaN;
        expect(room, `seed ${seed} throw ${n} step ${step}: ${what}`).toBeGreaterThan(-1e-6);
      }
    } }
  });
  it('answers one stone a call and leaves a ball that touches nothing alone', () => {
    setObstacles(stones, true);
    const out = { nx: 9, ny: 9, nz: 9 }, p = { x: 0, y: 80, z: 0 };
    expect(strikeObstacle(p, { x: 0, y: 0, z: 0 }, R, out)).toBe(false); expect(p).toEqual({ x: 0, y: 80, z: 0 }); expect(out.nx).toBe(9);
    const w = west(), skin = w.bottom + (w.top - w.bottom) * (14 - 2.05) / 24, inside = { x: w.x + skin - .2, y: 14, z: w.z };
    expect(strikeObstacle(inside, { x: -30, y: 0, z: 0 }, R, out)).toBe(true); expect(out.nx).toBeGreaterThan(.99); expect(inside.x).toBeCloseTo(w.x + skin + R, 6);
    expect(strikeObstacle(inside, { x: -30, y: 0, z: 0 }, R, out)).toBe(false); // moved out to the face, it is on it, not in it
    // Dead on a thin stone's axis there is no nearest side: back the way it came.
    setObstacles([{ x: 0, y: 80, z: 0, h: 10, top: .3, bottom: .3 }], false);
    const axis = { x: 0, y: 80, z: 0 };
    expect(strikeObstacle(axis, { x: 30, y: 0, z: 0 }, R, out)).toBe(true); expect(out.nx).toBeCloseTo(-1, 6); expect(axis.x).toBeCloseTo(-1.2, 6);
  });
});
describe('a cast-down demon and a standing stone', () => {
  it('strikes the megalith, is thrown back, and dies on the ground below, not against the stone', () => {
    setObstacles(stones, true);
    const s = createShooter(); createDroneSim(s); buildTargets(s); for (const t of s.targets) t.los = true;
    const b = createBanish(); resetBanish(b, s); resetBattle(0);
    const f = s.drones, w = west(), player = { x: -4, y: 20, z: 52 };
    const run = (seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 60); n++) { stepBanish(b, s, player, 1 / 60); buildTargets(s); for (const t of s.targets) t.los = true; } };
    Object.assign(f.pos[0], { ...FROM, y: 16 }); f.held[0] = 1; b.mode[0] = MODE.cast; b.timer[0] = 0; b.hit[0] = 0;
    Object.assign(b.vel[0], { x: -70, y: 0, z: 0 });
    run(.3);
    const hit = b.fx.find(e => e.kind === FX.impact && e.serial > 0)!;
    expect(hit).toBeDefined(); expect(hit.n).toBeGreaterThan(40);
    expect(hit.from.x - hit.to.x).toBeCloseTo(1, 2); expect(Math.abs(hit.from.y - hit.to.y)).toBeLessThan(.1); // the stone's near-upright face, toward the thrower
    expect(Math.hypot(hit.to.x - w.x, hit.to.z - w.z)).toBeLessThan(w.bottom + .1); // drawn on the stone
    expect(b.hit[0]).toBe(0); expect(s.stats.kills).toBe(0); // struck, not landed
    run(2.4);
    expect(s.stats.kills).toBe(1);
    const seal = b.fx.find(e => e.kind === FX.seal && e.serial > 0)!;
    expect(seal.to.y - floorAt(seal.to.x, seal.to.z)).toBeLessThan(2.5);
  });
  it('raises dust off the side of a stone, and dust (not spray) from the top of one that stands over the water', () => {
    expect(slamSurface(2, 0, WATER_LEVEL, 14)).toBe('wall');
    expect(slamSurface(WATER_LEVEL - 2, 1, WATER_LEVEL, 30)).toBe('ground'); // the head of a stele in the sea, or the arch over the gorge
    expect(slamSurface(WATER_LEVEL - 2, 1, WATER_LEVEL, WATER_LEVEL)).toBe('water');
  });
});
