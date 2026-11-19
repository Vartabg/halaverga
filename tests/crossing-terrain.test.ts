import { afterAll, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { WORLD } from '@/game/motion';
import { makeEdgeRing } from '@/world/edgeRingData';
import { makeHermonArch } from '@/world/hermonArch';
import { DAWN_BELT, glslVec3, skyBase, skyDirection } from '@/world/atmospherePalette';
import { skyBaseGlsl } from '@/world/skyShader';
import { crossingCamera } from '@/crossing/crossingCamera';
import { crossingSurface } from '@/crossing/crossingSurface';
import { createCrossing, launchCrossing, stepCrossing } from '@/crossing/flight';
import { makePassGround } from '@/crossing/passGeometry';
import { groundX, groundZ, passGroundAt } from '@/crossing/passGround';
import { passSnowCover, shoulderAxis } from '@/crossing/passLandforms';
import { passSurfaceAt, talusField } from '@/crossing/passTalus';
import { shoulderLift } from '@/crossing/shoulderWind';

const terrain = new Mesh(makePassGround(), new MeshBasicMaterial());
const arch = makeHermonArch().geometry, surface = crossingSurface(arch), ring = makeEdgeRing();
const ray = new Raycaster();
ray.ray.direction.set(0, -1, 0);
afterAll(() => { terrain.geometry.dispose(); terrain.material.dispose(); arch.dispose(); ring.dispose(); });

it('joins every surveyed rim vertex at the exact height and coordinates', () => {
  const p = ring.getAttribute('position');
  const rim = 2 * (WORLD.maxX - WORLD.minX + WORLD.maxZ - WORLD.minZ) / 5;
  for (let i = 0; i < rim; i++) {
    const x = p.getX(i), z = p.getZ(i);
    expect(groundX).toContain(x); expect(groundZ).toContain(z);
    expect(passGroundAt(x, z)).toBe(p.getY(i));
  }
});

it('puts the low hollow, exposed crest and camp on the same geometry used by flight', () => {
  for (const [x, z] of [[-24.82, 73.01], [-51.23, 47.62], [32.23, 52.12], [8.34, 64.17], [-33.3, -45.91], [-193.8, -218.91]]) {
    ray.ray.origin.set(x, 190, z);
    const hit = ray.intersectObject(terrain, false)[0];
    expect(hit.point.y).toBeCloseTo(passGroundAt(x, z), 5);
    expect(hit.normal!.y).toBeGreaterThan(0);
  }
  expect(passSnowCover(-31, 78)).toBeGreaterThan(.9);
  expect(passSnowCover(shoulderAxis(55) + 12, 55)).toBeLessThan(-.9);
  expect(passGroundAt(-26, 76)).toBeLessThan(0);
  expect(passGroundAt(shoulderAxis(55) + 12, 55) - passGroundAt(-26, 76)).toBeGreaterThan(30);
  for (const [x, z] of [[-38, -49], [-27, -41], [-33, -45]]) expect(surface(x, z)).toBeCloseTo(2.65, 2);
});

it('picks up the weathered tops of detached fragments and the arch underfoot', () => {
  for (const rock of talusField().chunks.filter((_, i) => i % 17 === 0)) {
    const centre = rock.faces[2][1];
    expect(passSurfaceAt(centre[0], centre[2])).toBeGreaterThanOrEqual(centre[1] - 1e-5);
  }
  const crown = new Mesh(arch, terrain.material);
  ray.ray.origin.set(14.37, 100, -.25);
  expect(surface(14.37, -.25)).toBeCloseTo(ray.intersectObject(crown, false)[0].point.y, 5);
});

it('seats both full arch end caps in the banks and leaves the central opening clear', () => {
  const p = arch.getAttribute('position');
  for (const side of [-1, 1]) {
    let shallowest = Infinity, count = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      if (side * x < 30.6) continue;
      shallowest = Math.min(shallowest, passGroundAt(x, p.getZ(i)) - p.getY(i));
      count++;
    }
    expect(count).toBeGreaterThan(10);
    expect(shallowest).toBeGreaterThan(.6);
  }
  expect(surface(0, 0) - passGroundAt(0, 0)).toBeGreaterThan(12);
});

it('carries the same low dawn band through the visible sky and reflection map', () => {
  expect(skyBaseGlsl).toContain(glslVec3(DAWN_BELT.color));
  const horizon = skyBase(skyDirection(0, 0)), band = skyBase(skyDirection(0, 6)), overhead = skyBase(skyDirection(0, 26));
  expect(band[0] / band[2]).toBeGreaterThan(horizon[0] / horizon[2] + .05);
  expect(band[0] / band[2]).toBeGreaterThan(overhead[0] / overhead[2] + .11);
});

it.each([30, 120])('adds ground-relative lift over the scoured beds at %i Hz', hz => {
  const rising = createCrossing(), sheltered = createCrossing();
  for (const s of [rising, sheltered]) launchCrossing(s);
  Object.assign(rising.player, { x: 24, y: 36, z: 69 });
  Object.assign(sheltered.player, { x: -26, y: 36, z: 69 });
  expect(shoulderLift(24, 36, 69)).toBeGreaterThan(1);
  expect(shoulderLift(-26, 36, 69)).toBe(0);
  expect(shoulderLift(24, 100, 69)).toBe(0);
  for (const s of [rising, sheltered]) for (let i = 0; i < hz; i++) stepCrossing(s, { horizontal: 0, vertical: 0, strike: false }, 1 / hz);
  expect(sheltered.player.y).toBeCloseTo(36, 6);
  expect(rising.player.y - sheltered.player.y).toBeGreaterThan(1.4);
  expect(rising.player.y - sheltered.player.y).toBeLessThan(2.5);
});

it.each([[390, 844], [844, 390], [1280, 850]])('frames both routes in flight order before launch at %i by %i', (w, h) => {
  const cam = new PerspectiveCamera(60, w / h, .12, 56000);
  crossingCamera()(cam, createCrossing(), w, h, true, surface); cam.updateMatrixWorld();
  const project = (x: number, z: number) => new Vector3(x, passGroundAt(x, z), z).project(cam);
  const hollow = project(-28, 79), crest = project(36, 58);
  expect(hollow.x).toBeGreaterThan(-.96); expect(hollow.x).toBeLessThan(-.1);
  expect(crest.x).toBeGreaterThan(.1); expect(crest.x).toBeLessThan(.96);
});
