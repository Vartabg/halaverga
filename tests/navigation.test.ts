import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { makeCity } from '../src/world/cityData';
import { FlightSafety } from '../src/game/FlightSafety';
import { advanceVelocity, FOOT, START, WORLD, type Vec } from '../src/game/motion';
import { BUILDING_ROUTE, CLEARANCE, removeInward, softenBounds } from '../src/game/navigation';
let solids: ReturnType<typeof makeCity>['solids'];
const worlds: RAPIER.World[] = [];
const routeResults: { from: string; to: string; clear: boolean }[] = [];
let stressSteps = 0, stressApproaches = 0;
const identity = { x: 0, y: 0, z: 0, w: 1 };
beforeAll(async () => { await RAPIER.init(); const city = makeCity(); solids = city.solids; city.geometry.dispose(); });
afterEach(() => { worlds.splice(0).forEach(w => w.free()); });
function setup(position: Vec) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); worlds.push(world);
  solids.forEach(s => world.createCollider(RAPIER.ColliderDesc.cuboid(...s.size).setTranslation(...s.position).setRotation(new Quaternion().setFromEuler(new Euler(...s.rotation)))));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), body);
  const controller = world.createCharacterController(CLEARANCE.margin); controller.setSlideEnabled(true);
  controller.setMaxSlopeClimbAngle(Math.PI / 2); controller.setMinSlopeSlideAngle(0); world.step();
  return { world, body, capsule, controller, safety: new FlightSafety(world, RAPIER, capsule) };
}
function move(fixture: ReturnType<typeof setup>, velocity: Vec) {
  const { body, controller, capsule, safety, world } = fixture, p = body.translation();
  const predicted = safety.anticipate(p, softenBounds(p, velocity));
  controller.computeColliderMovement(capsule, { x: predicted.velocity.x / 60, y: predicted.velocity.y / 60, z: predicted.velocity.z / 60 });
  const m = controller.computedMovement(); let corrected = predicted.velocity;
  for (let c = 0; c < controller.numComputedCollisions(); c++) corrected = removeInward(corrected, controller.computedCollision(c)!.normal1);
  body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step();
  expect(safety.isClear(body.translation())).toBe(true);
  return corrected;
}
describe('authored city navigation', () => {
  it('seals the broken upper stories, while keeping both principal landings valid', () => {
    const f = setup(START);
    expect(f.safety.isClear({ x: -62, y: 33.3, z: 16 })).toBe(false);
    expect(f.safety.isClear({ x: 36, y: 54, z: -38 })).toBe(false);
    expect(f.safety.canLand({ x: 0, y: 20, z: 65 })).toBe(true);
    expect(f.safety.canLand({ x: 30, y: 61.415, z: -38 })).toBe(true);
  });
  it('verifies a body-width flight tube along every planned route segment', () => {
    const { world, capsule } = setup(START);
    for (let i = 1; i < BUILDING_ROUTE.length; i++) {
      const a = BUILDING_ROUTE[i - 1], b = BUILDING_ROUTE[i];
      const start = a;
      const hit = world.castShape(start, identity, { x: b.x - start.x, y: b.y - start.y, z: b.z - start.z }, i === 1 ? capsule.shape : new RAPIER.Ball(1.15), 0, 1, false, undefined, undefined, capsule);
      routeResults.push({ from: a.label, to: b.label, clear: !hit });
      expect(hit, `${a.label} → ${b.label}`).toBeNull();
    }
  });
  it('stops a full-speed facade approach early and immediately allows departure', () => {
    const f = setup({ x: -62, y: 33.3, z: 42 });
    for (let i = 0; i < 180; i++) move(f, { x: 0, y: 0, z: -34 });
    expect(f.body.translation().z).toBeGreaterThan(27.3);
    const stopped = f.body.translation().z;
    for (let i = 0; i < 30; i++) move(f, { x: 0, y: 0, z: 13 });
    expect(f.body.translation().z).toBeGreaterThan(stopped + 5);
  });
  it('preserves tangential movement rather than sticking to a facade', () => {
    const f = setup({ x: -48, y: 15, z: 38 });
    const before = f.body.translation();
    for (let i = 0; i < 45; i++) move(f, { x: -8, y: 0, z: -25 });
    expect(f.body.translation().x).toBeLessThan(before.x - 4);
  });
  it('rejects trapped, unsupported and narrow-edge checkpoints', () => {
    const f = setup(START);
    expect(f.safety.checkpoint({ x: -62, y: 33.3, z: 16 })).toEqual(START);
    expect(f.safety.checkpoint({ x: 0, y: 50, z: 45 })).toEqual(START);
    expect(f.safety.canLand({ x: 11.9, y: 20, z: 65 })).toBe(false);
    expect(f.safety.checkpoint(START)).toEqual(START);
    expect(f.safety.pathClear({ x: -62, y: 33.3, z: 42 }, { x: -62, y: 33.3, z: 0 })).toBe(false);
  });
  it('brakes at all district limits while allowing a turn back', () => {
    const cases = [
      [{ x: WORLD.maxX - 4, y: 70, z: 0 }, { x: 34, y: 0, z: 0 }],
      [{ x: WORLD.minX + 4, y: 70, z: 0 }, { x: -34, y: 0, z: 0 }],
      [{ x: 0, y: 70, z: WORLD.minZ + 4 }, { x: 0, y: 0, z: -34 }],
      [{ x: 0, y: 70, z: WORLD.maxZ - 4 }, { x: 0, y: 0, z: 34 }],
      [{ x: 0, y: WORLD.ceiling - 4, z: 40 }, { x: 0, y: 34, z: 0 }],
    ];
    for (const [p, v] of cases) {
      for (let i = 0; i < 180; i++) { const safe = softenBounds(p, v); p.x += safe.x / 60; p.y += safe.y / 60; p.z += safe.z / 60; }
      expect(p.x).toBeLessThan(WORLD.maxX); expect(p.x).toBeGreaterThan(WORLD.minX);
      expect(p.z).toBeGreaterThan(WORLD.minZ); expect(p.z).toBeLessThan(WORLD.maxZ); expect(p.y).toBeLessThan(WORLD.ceiling);
      const reverse = { x: -v.x || 0, y: -v.y || 0, z: -v.z || 0 }; expect(softenBounds(p, reverse)).toEqual(reverse);
    }
  });
  it('keeps seeded high-speed approaches outside the authored solids', () => {
    const f = setup(START); let seed = 7331;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let attempt = 0; attempt < 160; attempt++) {
      const p = { x: -190 + random() * 380, y: 3.2 + random() * 88, z: -178 + random() * 270 };
      if (f.world.intersectionWithShape(p, identity, new RAPIER.Ball(1.5), undefined, undefined, f.capsule)) continue;
      f.body.setTranslation(p, true); f.body.setNextKinematicTranslation(p); f.world.step();
      const yaw = random() * Math.PI * 2, pitch = (random() - .5) * 1.8;
      const v = { x: Math.sin(yaw) * Math.cos(pitch) * 34, y: Math.sin(pitch) * 34, z: Math.cos(yaw) * Math.cos(pitch) * 34 };
      for (let i = 0; i < 60; i++) { move(f, v); stressSteps++; }
      stressApproaches++;
    }
    expect(stressApproaches).toBeGreaterThan(80);
  });
  it('caps free-flight acceleration and removes velocity into a contact plane', () => {
    const next = advanceVelocity({ x: 0, y: 0, z: 0 }, { forward: 1, strafe: 0, vertical: 0 }, 0, 0, true, true, 1 / 60);
    expect(Math.hypot(next.x, next.y, next.z) * 60).toBeLessThanOrEqual(42.001);
    expect(removeInward({ x: 8, y: 0, z: -34 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 8, y: 0, z: 0 });
    expect(FOOT).toBeGreaterThan(1 + CLEARANCE.margin);
  });
});

afterAll(() => {
  const output = process.env.NAV_REPORT_DIR; if (!output) return;
  const width = WORLD.maxX - WORLD.minX, depth = WORLD.maxZ - WORLD.minZ;
  const rectangles = solids.filter(s => s.kind === 'building').map(s => `<rect x="${s.position[0] - s.size[0]}" y="${s.position[2] - s.size[2]}" width="${s.size[0] * 2}" height="${s.size[2] * 2}" fill="#957b76" fill-opacity=".6" stroke="#e0bc99" stroke-width=".6"/>`).join('');
  const stops = ['arrival', 'boulevard', 'viaduct', 'roof'].map(id => BUILDING_ROUTE.find(p => p.id === id)!);
  const pins = stops.map((p, i) => `<circle cx="${p.x}" cy="${p.z}" r="6" fill="#d4f197"/><text x="${p.x}" y="${p.z + 3}" text-anchor="middle" fill="#14282e" font-size="9">${i + 1}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-225 -208 450 336" role="img"><title>Meridian exterior flight route</title><desc>Building exclusion footprints, district perimeter and route from the arrival terrace through the flooded boulevard and viaduct to the tower roof. Altitude varies along the route.</desc><rect x="-225" y="-208" width="450" height="336" rx="8" fill="#142b32"/><rect x="${WORLD.minX}" y="${WORLD.minZ}" width="${width}" height="${depth}" fill="#27484a" stroke="#e8c59d" stroke-dasharray="4 3"/><path d="M0 108V-188" stroke="#247484" stroke-width="28"/>${rectangles}<polyline points="${BUILDING_ROUTE.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#d4f197" stroke-width="2"/>${pins}<text x="-205" y="-197" fill="#f5f0dc" font-family="sans-serif" font-size="8">MERIDIAN · EXTERIOR SURVEY · NORTH ↑</text></svg>`;
  const sources = ['src/game/FlightSafety.ts','src/game/navigation.ts','src/game/motion.ts','src/world/kit.ts','src/world/cityData.ts','src/game/Player.tsx','src/world/DistrictBoundary.tsx'];
  const report = { engine: 'Rapier ' + RAPIER.version(), generatedAt: new Date().toISOString(), maximumSpeed: 34, physicsStepSeconds: 1 / 60, bounds: WORLD, cityColliderCount: solids.length, exteriorBuildingVolumes: solids.filter(s => s.kind === 'building').length, flightProbeRadius: 1.05, routeAuditRadius: 1.15, route: BUILDING_ROUTE, routeResults, stressApproaches, stressSteps, sourceHashes: Object.fromEntries(sources.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')])), scope: 'Finite seeded swept-body regression and declared route tubes in the actual city geometry. Not an exhaustive proof of every trajectory or physical-device validation.' };
  mkdirSync(output, { recursive: true }); writeFileSync(join(output, 'district-map.svg'), svg); writeFileSync(join(output, 'navigation-audit.json'), JSON.stringify(report, null, 2) + '\n');
});
