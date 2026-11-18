import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster } from 'three';
import { BLADE, BODY, axisGap } from '../src/game/bladeReach';
import type { Vec } from '../src/game/motion';
import { ARCH, archSection } from '../src/world/archData';
import { heightAt } from '../src/world/massifData';
import { makeMassifChunk } from '../src/world/massifGeometry';
import { ARRIVAL, clearApproach } from '../src/crossing/course';
import { createCrossing, launchCrossing, stepCrossing, type Crossing, type CrossingInput } from '../src/crossing/flight';

const neutral = { horizontal: 0, vertical: 0, strike: false };
const leftDive = { horizontal: -1, vertical: -1, strike: false };
const right = { horizontal: 1, vertical: 0, strike: false };
const routes = [
  { name: 'low', steer: (t: number) => t < 1.4 ? leftDive : neutral, press: 4.1 },
  { name: 'high', steer: (t: number) => t < 1.5 ? right : neutral, press: 6.7 },
];
const distance = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
function launched() {
  const s = createCrossing();
  launchCrossing(s);
  return s;
}
function advance(s: Crossing, seconds: number, input: CrossingInput, hz: number) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) stepCrossing(s, input, 1 / hz);
}

describe.each([30, 120])('crossing flight at %i Hz', hz => {
  it.each(routes)('has a continuous $name opening the pilot can see and act on', route => {
    const s = launched();
    let consecutive = 0, longest = 0;
    for (let frame = 0; frame < Math.round(ARRIVAL * hz); frame++) {
      stepCrossing(s, route.steer(frame / hz), 1 / hz);
      consecutive = s.inReach ? consecutive + 1 / hz : 0;
      longest = Math.max(longest, consecutive);
      if (s.inReach && route.name === 'low') {
        expect(s.player.x).toBeLessThan(-15);
        expect(s.player.y).toBeLessThan(21);
      } else if (s.inReach) {
        expect(s.player.x).toBeGreaterThan(14);
        expect(s.player.y).toBeGreaterThan(30);
      }
    }
    expect(longest).toBeGreaterThan(.5);
    expect(s.phase).toBe('late');
  });

  it.each(routes)('puts the sword in contact after a deliberate $name strike, then the Watcher pulls away', route => {
    const s = launched();
    for (let frame = 0; frame < Math.round(route.press * hz); frame++) stepCrossing(s, route.steer(frame / hz), 1 / hz);
    expect(s.inReach).toBe(true);
    expect(distance(s.player, s.watcher)).toBeGreaterThan(4);
    advance(s, 1 / hz, { ...neutral, strike: true }, hz);
    expect(s.phase).toBe('strike');
    for (let frame = 0; frame < hz && s.phase === 'strike'; frame++) stepCrossing(s, neutral, 1 / hz);
    expect(s.phase).toBe('safe');
    const dx = s.player.x - s.watcher.x, dy = s.player.y + BLADE.chest - s.watcher.y - BODY.lesser.y, dz = s.player.z - s.watcher.z;
    expect(axisGap(dx, dy, dz, dx, dy, dz, BODY.lesser.half)).toBeLessThanOrEqual(BLADE.reach + BODY.lesser.radius);
    expect(s.strikeTime).toBeGreaterThan(.08);
    const struckAt = { ...s.watcher };
    advance(s, 1, neutral, hz);
    expect(s.watcher.x).toBeLessThan(struckAt.x - 6);
    expect(s.watcher.y).toBeGreaterThan(struckAt.y + 5);
    launchCrossing(s);
    expect(s).toEqual(launched());
  });

  it('lets the Watcher reach the travelers when a pilot mashes strike all the way down the center', () => {
    const s = launched();
    let closest = Infinity;
    for (let frame = 0; frame < Math.round(ARRIVAL * hz); frame++) {
      stepCrossing(s, { ...neutral, strike: true }, 1 / hz);
      closest = Math.min(closest, distance(s.player, s.watcher));
    }
    expect(s.phase).toBe('late');
    expect(s.elapsed).toBeCloseTo(ARRIVAL, 8);
    expect(s.watcher.x).toBeCloseTo(24);
    expect(s.watcher.z).toBeCloseTo(-.82, 1);
    expect(closest).toBeGreaterThan(13);
    advance(s, 4, neutral, hz);
    expect(s.after).toBeGreaterThan(3.9);
    launchCrossing(s);
    expect(s).toEqual(launched());
  });

  it('leaves too much gorge to regain the high opening after flying out of the low one', () => {
    const s = launched();
    let highGap = Infinity;
    for (let frame = 0; frame < Math.round(ARRIVAL * hz); frame++) {
      const t = frame / hz;
      const steering = t < 5.15 ? routes[0].steer(t) : { ...right, vertical: t < 6.55 ? 1 : 0 };
      stepCrossing(s, steering, 1 / hz);
      if (t >= 6) highGap = Math.min(highGap, distance(s.player, s.watcher));
    }
    expect(highGap).toBeGreaterThan(20);
  });
});

it('consumes a missed press once, even if its display frame advances into reach', () => {
  const s = launched();
  advance(s, 1.4, leftDive, 60);
  expect(Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z)).toBeGreaterThan(30);
  advance(s, 2.2, neutral, 60);
  expect(s.inReach).toBe(false);
  stepCrossing(s, { ...neutral, strike: true }, .1);
  expect(s.inReach).toBe(true);
  expect(s.phase).toBe('flight');
  advance(s, 4.5, neutral, 60);
  expect(s.phase).toBe('late');
});

it('accepts a single held analog steer and a fresh release during the high opening', () => {
  const s = launched();
  advance(s, 4.7, neutral, 60);
  advance(s, 1.9, right, 60);
  expect(s.inReach).toBe(true);
  advance(s, 1 / 60, { ...neutral, strike: true }, 60);
  advance(s, .6, neutral, 60);
  expect(s.phase).toBe('safe');
});

it('matches the same physical pose at two display rates and keeps the vectors live across retry', () => {
  const a = launched(), b = launched(), player = a.player;
  for (const [s, hz] of [[a, 30], [b, 120]] as const) {
    advance(s, 1.4, leftDive, hz);
    advance(s, 2.7, neutral, hz);
  }
  expect(a).toEqual(b);
  launchCrossing(a);
  expect(a.player).toBe(player);
  expect(a.player).not.toEqual(b.player);
});

it('finishes an earned strike pressed one simulation tick before the Watcher arrives', () => {
  const s = launched();
  advance(s, 1.45, right, 120);
  advance(s, 5.15, neutral, 120);
  advance(s, 1.5 - 1 / 120, { ...neutral, vertical: -.8 }, 120);
  expect(s.inReach).toBe(true);
  stepCrossing(s, { ...neutral, strike: true }, 1 / 120);
  expect(s.phase).toBe('strike');
  advance(s, .3, neutral, 120);
  expect(s.phase).toBe('safe');
});

it('uses both the arch opening and the mountain relief for sight', () => {
  const across = (y: number, z0: number, z1: number) =>
    clearApproach({ x: 0, y, z: z0 }, { x: 0, y, z: z1 }, Math.abs(z1 - z0));
  expect(across(11.6, 7, -9)).toBe(false);
  expect(across(5, 7, -9)).toBe(true);
  expect(across(18, 7, -9)).toBe(true);
  expect(across(14, 41, 89)).toBe(false);
});

it('keeps a held dive out of the water, the promontory and the cloven rock', () => {
  for (const horizontal of [-.75, 0, .75]) {
    const s = launched();
    let floorGap = Infinity, archGap = Infinity;
    for (let frame = 0; frame < ARRIVAL * 120; frame++) {
      stepCrossing(s, { horizontal: frame < 144 ? horizontal : 0, vertical: -1, strike: false }, 1 / 120);
      const { x, y, z } = s.player;
      floorGap = Math.min(floorGap, y - Math.max(.1, heightAt(x, z)));
      if (x < ARCH.x0 || x > ARCH.x1 || Math.abs(z - ARCH.z) > 8) continue;
      const rock = archSection((x - ARCH.x0) / (ARCH.x1 - ARCH.x0));
      archGap = Math.min(archGap, Math.hypot((y - rock.cy) / (rock.ry + 1.3), (z - rock.cz) / (rock.rz + 1.3)));
    }
    expect(floorGap).toBeGreaterThan(2);
    expect(archGap).toBeGreaterThan(1);
    expect(archGap).toBeLessThan(Infinity);
  }
});

it('clears the drawn triangles where the eastern summit shoulder rises sharply out of the gorge', () => {
  const shoulder = makeMassifChunk('shoulder', { minX: 0, maxX: 30, minZ: -50, maxZ: -10 }, 5);
  const mesh = new Mesh(shoulder.geometry, new MeshBasicMaterial()), ray = new Raycaster(), s = launched();
  ray.ray.direction.set(0, -1, 0);
  let nearest = Infinity, measured = 0;
  for (let frame = 0; frame < ARRIVAL * 120; frame++) {
    stepCrossing(s, { horizontal: frame < 144 ? .5 : 0, vertical: -1, strike: false }, 1 / 120);
    const { x, y, z } = s.player;
    if (x < 5 || x > 25 || z > -15 || z < -45) continue;
    ray.ray.origin.set(x, 150, z);
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit) { measured++; nearest = Math.min(nearest, y - hit.point.y); }
  }
  shoulder.geometry.dispose(); mesh.material.dispose();
  expect(measured).toBeGreaterThan(10);
  expect(nearest).toBeGreaterThan(1.5);
});
