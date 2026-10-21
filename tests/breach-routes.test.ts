import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeSanctuary } from '../src/world/sanctuaryData';
import { createShooterWorld, shotSegmentClear } from '../src/game/shotResolve';
import { BREACH, breachRoute } from '../src/game/breachRoutes';
beforeAll(() => RAPIER.init());
it('offers body-clear lower and upper paths with entrances, exits and room to stop', () => {
  const scene = makeSanctuary(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.trimesh(scene.vertices, scene.indices)); world.step();
    const sphere = new RAPIER.Ball(2.1), q = { x: 0, y: 0, z: 0, w: 1 };
    for (const route of [BREACH.low, BREACH.high]) for (let z = route.entry; z >= route.exit; z -= 2) {
      const p = { x: route.x, y: route.y, z };
      expect(world.intersectionWithShape(p, q, sphere), `body clearance ${JSON.stringify(p)}`).toBeNull();
      expect(breachRoute(p)).toBe(route === BREACH.low ? 'low' : 'high');
    }
    expect(scene.indices.length / 3).toBeLessThan(60000);
  } finally { world.free(); scene.geometry.dispose(); }
});
it('uses actual stone to stop a volley, while the open nave remains exposed', () => {
  const scene = makeSanctuary(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.trimesh(scene.vertices, scene.indices)); world.step();
    const rays = createShooterWorld(world, RAPIER), caster = { x: 0, y: 42, z: -85 };
    expect(shotSegmentClear(rays, caster, { x: -49, y: 15, z: -57 })).toBe(false);
    expect(shotSegmentClear(rays, caster, { x: 0, y: 25, z: -57 })).toBe(true);
    expect(shotSegmentClear(rays, { x: 43, y: 70, z: -50 }, caster)).toBe(true);
  } finally { world.free(); scene.geometry.dispose(); }
});
