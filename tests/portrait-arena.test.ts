import { beforeAll, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { makeSanctuary } from '../src/world/sanctuaryData';
import { PATROLS, patrolPosition } from '../src/game/dronePatrols';
beforeAll(() => RAPIER.init());
it('leaves the central 60 m combat nave open between the useful perimeter routes', () => {
  const scene = makeSanctuary(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.trimesh(scene.vertices, scene.indices)); world.step();
    const ball = new RAPIER.Ball(2), q = { x: 0, y: 0, z: 0, w: 1 };
    for (const x of [-30, -15, 0, 15, 30]) for (const y of [25, 35, 45, 54]) for (let z = 40; z >= -125; z -= 5)
      expect(world.intersectionWithShape({ x, y, z }, q, ball), `air at ${x},${y},${z}`).toBeNull();
    console.log('ARENA TRIANGLES', scene.indices.length / 3);
  } finally { world.free(); scene.geometry.dispose(); }
});
it('keeps the main low/mid combat targets visible from the portrait approach and central chase positions', () => {
  const scene = makeSanctuary(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(RAPIER.ColliderDesc.trimesh(scene.vertices, scene.indices)); world.step();
    const target = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 0 };
    for (const from of [{ x: 0, y: 25, z: 50 }, { x: -20, y: 35, z: 10 }, { x: 20, y: 45, z: -55 }])
      for (const patrol of PATROLS) for (let n = 0; n < 12; n++) {
        patrolPosition(patrol, n / 12 * Math.PI * 2 / patrol.omega, target);
        const d = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
        dir.x = (target.x - from.x) / d; dir.y = (target.y - from.y) / d; dir.z = (target.z - from.z) / d;
        expect(world.castRay(new RAPIER.Ray(from, dir), Math.max(0, d - 1), true), `${patrol.id} from ${JSON.stringify(from)}`).toBeNull();
      }
    expect(world.castRay(new RAPIER.Ray({ x: 30, y: 64, z: -38 }, { x: 0, y: -1, z: 0 }), 5, true)?.timeOfImpact).toBeCloseTo(2.56, 1);
  } finally { world.free(); scene.geometry.dispose(); }
});
