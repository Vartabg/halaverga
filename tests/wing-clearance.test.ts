import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Group, Matrix4, Vector3 } from 'three';
import { createArchangelWings, poseArchangelWing, stepArchangelWings } from '../src/world/archangelWings';
import { createWingClearance, wingBlocks } from '../src/world/wingClearance';
import { createWingEnvelope } from '../src/world/wingEnvelope';
import { BOUNDARY_GROUPS, FRAME_GROUPS } from '../src/game/combat';
beforeAll(() => RAPIER.init());
const still = { x: 0, y: 0, z: 0 }, identity = { x: 0, y: 0, z: 0, w: 1 };
function fixture() {
  const world = new RAPIER.World(still), w = createArchangelWings(), body = new Group(), chest = new Group();
  body.position.y = 10; chest.position.y = .34; body.add(chest); chest.add(w.root);
  Object.assign(w.motion, { flying: true, unfold: 1, glide: 1 });
  stepArchangelWings(w, true, false, false, 24, 0, 0, 0);
  const clearance = createWingClearance(w, world, RAPIER);
  const stone = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
  return { world, w, body, chest, clearance, stone, step(seconds = 1, velocity = still, hz = 60) {
    for (let i = 0; i < seconds * hz; i++) clearance.step(velocity, 1 / hz);
  }, free() { w.dispose(); world.free(); } };
}
function surfaceClear(f: ReturnType<typeof fixture>) {
  expect(f.clearance.stats.constrained).toBe(false);
  f.w.root.updateWorldMatrix(true, true);
  const p = new Vector3();
  for (const wing of [f.w.left, f.w.right]) {
    const g = wing.mesh.geometry, vertices = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      wing.mesh.getVertexPosition(i, p); p.applyMatrix4(wing.mesh.matrixWorld); p.toArray(vertices, i * 3);
    }
    // Check all rendered triangles against the real stone, not just a few wingtip rays.
    expect(f.world.intersectionWithShape(still, identity, new RAPIER.TriMesh(vertices, new Uint32Array(g.index!.array)),
      undefined, undefined, undefined, undefined, wingBlocks)).toBeNull();
  }
}
describe('wings make room for actual solid geometry', () => {
  it('bounds every skinned triangle through folds, strokes and a rotated flight frame', () => {
    const f = fixture(), probe = createWingEnvelope(f.w.right), inverse = new Matrix4(), p = new Vector3();
    try {
      f.body.rotation.set(.2, .8, .3);
      for (const tuck of [0, .5, 1]) for (const phase of [.23, .73]) {
        f.w.motion.phase = phase; f.w.motion.glide = 0;
        stepArchangelWings(f.w, true, false, false, 0, 0, .3, 0); poseArchangelWing(f.w, 1, tuck);
        f.body.updateMatrixWorld(true); inverse.copy(f.w.root.matrixWorld).invert(); probe.update(inverse);
        const g = f.w.right.mesh.geometry;
        for (let i = 0; i < g.attributes.position.count; i++) {
          f.w.right.mesh.getVertexPosition(i, p); p.applyMatrix4(f.w.right.mesh.matrixWorld).applyMatrix4(inverse);
          if (!probe.bounds.some(b => b.distanceToPoint(p) < .00001)) expect.fail(`Unbounded vertex ${i}, fold ${tuck}, phase ${phase}`);
        }
      }
    } finally { f.free(); }
  });
  it('tucks only the near wing beside a wall, then waits and reopens smoothly', () => {
    const f = fixture();
    try {
      const wall = f.stone(1.05, 10, 0, .12, 6, 6); f.world.step(); f.step();
      expect(f.w.tuck.right).toBeGreaterThan(.4); expect(f.w.tuck.left).toBeLessThan(.001); surfaceClear(f);
      const folded = f.w.tuck.right; f.world.removeCollider(wall, true); f.world.step();
      f.step(.15); expect(f.w.tuck.right).toBeGreaterThan(folded * .95);
      f.step(.25); expect(f.w.tuck.right).toBeGreaterThan(.1); expect(f.w.tuck.right).toBeLessThan(folded);
      f.step(1); expect(f.w.tuck.right).toBeLessThan(.02); surfaceClear(f);
    } finally { f.free(); }
  });
  it('anticipates a tight passage at surge speed and keeps the actual feather surfaces out of both walls', () => {
    const f = fixture(), v = { x: 0, y: 0, z: -34 }; let before = 0, inside = 0;
    try {
      for (const side of [-1, 1]) f.stone(side * 1.05, 10, 0, .10, 6, 3);
      f.world.step();
      for (let frame = 0; frame <= 48; frame++) {
        f.body.position.z = 8 - frame * 34 / 60; f.clearance.step(v, 1 / 60);
        if (frame === 4) before = f.w.tuck.left;
        if (frame === 16) inside = f.w.tuck.left;
        if (frame % 8 === 0) surfaceClear(f);
      }
      expect(before).toBeGreaterThan(.3); expect(inside).toBeGreaterThan(.65);
      f.step(1.5); expect(f.w.tuck.left).toBeLessThan(.02); expect(f.w.tuck.right).toBeLessThan(.02);
    } finally { f.free(); }
  });
  it('reserves the whole hover stroke beneath a thin beam, including the recovery phase', () => {
    const f = fixture();
    try {
      f.stone(0, 11.45, .1, 3, .12, .25); f.world.step();
      for (let frame = 0; frame < 120; frame++) {
        stepArchangelWings(f.w, true, false, false, 0, 0, 0, 1 / 60); f.clearance.step(still, 1 / 60);
        if (frame % 20 === 0) surfaceClear(f);
      }
      expect(Math.min(f.w.tuck.left, f.w.tuck.right)).toBeGreaterThan(.1);
    } finally { f.free(); }
  });
  it('handles a sudden turn into a nearby wall without waiting for the closing animation', () => {
    const f = fixture();
    try {
      f.stone(0, 10, -1.05, 5, 6, .1); f.world.step(); f.step();
      expect(f.w.tuck.left + f.w.tuck.right).toBeLessThan(.001);
      f.body.rotation.y = Math.PI / 2; f.clearance.step(still, 1 / 60); surfaceClear(f);
      expect(f.w.tuck.right).toBeGreaterThan(.4);
    } finally { f.free(); }
  });
  it('freezes all tucking state while paused and respects reduced motion without removing clearance', () => {
    const f = fixture();
    try {
      f.stone(1.05, 10, 0, .12, 6, 6); f.world.step();
      f.clearance.step(still, 1 / 60, false, true); const saved = JSON.stringify([f.w.tuck, f.clearance.states]);
      expect(f.w.tuck.right).toBeGreaterThan(.4); surfaceClear(f);
      f.body.position.x = -5; for (let i = 0; i < 60; i++) f.clearance.step(still, 1 / 60, true);
      expect(JSON.stringify([f.w.tuck, f.clearance.states])).toBe(saved);
      f.step(1.5); expect(f.w.tuck.right).toBeLessThan(.02);
    } finally { f.free(); }
  });
  it('does not reserve an invisible wingbeat during a steady glide or with reduced motion', () => {
    const f = fixture();
    try {
      f.stone(0, 11.45, .1, 3, .12, .25); f.world.step();
      f.step(); expect(f.w.tuck.left + f.w.tuck.right).toBeLessThan(.001); surfaceClear(f);
      for (let i = 0; i < 60; i++) {
        stepArchangelWings(f.w, true, false, true, 0, 0, 0, 1 / 60); f.clearance.step(still, 1 / 60, false, true);
      }
      expect(f.w.tuck.left + f.w.tuck.right).toBeLessThan(.001); surfaceClear(f);
    } finally { f.free(); }
  });
  it('ignores the player, sensors and invisible limits while still detecting narrow stone frames', () => {
    const f = fixture();
    try {
      f.stone(1, 10, 0, .1, 5, 5).setCollisionGroups(BOUNDARY_GROUPS);
      f.stone(-1, 10, 0, .1, 5, 5).setSensor(true);
      const player = f.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      f.world.createCollider(RAPIER.ColliderDesc.ball(2), player); f.world.step(); f.step();
      expect(f.w.tuck.left + f.w.tuck.right).toBeLessThan(.001);
      f.stone(1.05, 10, 0, .02, 5, 5).setCollisionGroups(FRAME_GROUPS); f.world.step(); f.step();
      expect(f.w.tuck.right).toBeGreaterThan(.4);
    } finally { f.free(); }
  });
  it('uses elapsed time for reopening at 30, 60 and 120 Hz', () => {
    const values = [30, 60, 120].map(hz => {
      const f = fixture(); try { f.w.tuck.left = .9; f.step(.5, still, hz); return f.w.tuck.left; } finally { f.free(); }
    });
    for (const v of values) expect(v).toBeCloseTo(values[0], 6);
  });
});
