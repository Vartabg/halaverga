import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
beforeAll(async () => { await RAPIER.init(); });
describe('real Rapier capsule shape sweeps', () => {
  it('stops maximum-speed travel at a 5cm wall without tunneling', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 10, .025));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 5));
    const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), body);
    const controller = world.createCharacterController(.015); world.step();
    for (let i = 0; i < 40; i++) {
      controller.computeColliderMovement(capsule, { x: 0, y: 0, z: -34 / 60 });
      const p = body.translation(), m = controller.computedMovement();
      body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step();
    }
    expect(body.translation().z).toBeGreaterThan(.42);
    expect(body.translation().z).toBeLessThan(.46); world.free();
  });
  it('stops a fast descent above a thin rooftop slab', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, .14, 10).setTranslation(0, 10, 0));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 18, 0));
    const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), body);
    const controller = world.createCharacterController(.015); world.step();
    for (let i = 0; i < 40; i++) {
      controller.computeColliderMovement(capsule, { x: 0, y: -34 / 60, z: 0 });
      const p = body.translation(), m = controller.computedMovement();
      body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step();
    }
    expect(body.translation().y).toBeGreaterThan(11.14);
    expect(body.translation().y).toBeLessThan(11.18); world.free();
  });
});
