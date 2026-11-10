import { describe, expect, it } from 'vitest';
import { Box3, Group, Quaternion, Vector3 } from 'three';
import { advanceWingMotion, createWingMotion, type WingInput } from '../src/world/wingMotion';
import { alignArchangelWings, createArchangelWings, stepArchangelWings } from '../src/world/archangelWings';
const input: WingInput = { flying: true, paused: false, reduced: false, speed: 0, vy: 0, roll: 0, brake: 0 };
const advance = (w: ReturnType<typeof createWingMotion>, f: WingInput, seconds: number, hz = 60) => {
  for (let i = 0; i < seconds * hz; i++) advanceWingMotion(w, f, 1 / hz);
};
const snapshot = (w: ReturnType<typeof createArchangelWings>) => [JSON.stringify(w.motion), ...[...w.left.bones, ...w.right.bones].map(b => b.quaternion.toArray().join(','))];
function bounds(w: ReturnType<typeof createArchangelWings>) {
  w.root.updateMatrixWorld(true); const box = new Box3(), p = new Vector3();
  for (const wing of [w.left, w.right]) for (let i = 0; i < wing.mesh.geometry.attributes.position.count; i++) {
    wing.mesh.getVertexPosition(i, p); p.applyMatrix4(wing.mesh.matrixWorld); box.expandByPoint(p);
  }
  return box;
}

describe('wings express the actual flight state', () => {
  it('holds the complete pose and unfolding state exactly while paused', () => {
    const w = createArchangelWings(); for (let i = 0; i < 90; i++) stepArchangelWings(w, true, false, false, 0, 0, 0, 1 / 60);
    const before = snapshot(w); for (let i = 0; i < 120; i++) stepArchangelWings(w, false, true, false, 30, 8, .4, 1 / 30, 1);
    expect(snapshot(w)).toEqual(before); w.dispose();
  });
  it('keeps stroke timing and unfolding consistent at 30, 60 and 120 Hz', () => {
    const states = [30, 60, 120].map(hz => { const w = createWingMotion(); advance(w, input, 3, hz); return w; });
    for (const w of states) { expect(w.phase).toBeCloseTo(states[0].phase, 3); expect(w.unfold).toBeCloseTo(states[0].unfold, 6); }
  });
  it('settles into a steady glide and resumes power strokes for a climb or braking flare', () => {
    const m = createWingMotion(); advance(m, input, 2); expect(m.amplitude).toBeGreaterThan(.60); expect(m.mode).toBe('hover');
    advance(m, { ...input, speed: 24 }, 3); expect(m.mode).toBe('glide'); expect(m.amplitude).toBeLessThan(.001);
    advance(m, { ...input, speed: 24, vy: 7 }, 1); expect(m.mode).toBe('powered'); expect(m.amplitude).toBeGreaterThan(.7);
    advance(m, { ...input, speed: 12, brake: 1 }, 1); expect(m.mode).toBe('brake'); expect(m.brake).toBeGreaterThan(.99);
  });
  it('removes repetitive beats with reduced motion while retaining the selected flight pose', () => {
    const m = createWingMotion(); advance(m, input, 1); const phase = m.phase;
    advance(m, { ...input, reduced: true }, 3); expect(m.phase).toBe(phase); expect(m.stroke).toBe(0); expect(m.amplitude).toBe(0); expect(m.recovery).toBe(0);
  });
  it('tucks the grounded feathers above the feet and close to the back', () => {
    const w = createArchangelWings(), chest = new Group(); chest.position.y = .34; chest.add(w.root);
    const b = bounds(w);
    expect(b.min.y).toBeGreaterThan(-.98); expect(b.max.x - b.min.x).toBeLessThan(1.65); expect(b.min.z).toBeGreaterThan(.02); w.dispose();
  });
  it('keeps the wing roots attached and reduces wrist span on the recovery stroke', () => {
    const w = createArchangelWings(); Object.assign(w.motion, { unfold: 1, phase: .23, flying: true });
    stepArchangelWings(w, true, false, false, 0, 0, 0, 0); w.root.updateMatrixWorld(true);
    const root = w.right.bones[0].getWorldPosition(new Vector3()), down = w.right.bones[3].getWorldPosition(new Vector3());
    w.motion.phase = .73; stepArchangelWings(w, true, false, false, 0, 0, 0, 0); w.root.updateMatrixWorld(true);
    const recovery = w.right.bones[3].getWorldPosition(new Vector3());
    expect(w.right.bones[0].getWorldPosition(new Vector3()).distanceTo(root)).toBeLessThan(1e-8);
    expect(down.x).toBeGreaterThan(recovery.x + .10); w.dispose();
  });
  it('keeps lifting surfaces in the flight frame when the body leans prone, without removing the bank', () => {
    const w = createArchangelWings(), body = new Group(), chest = new Group(); body.add(chest); chest.add(w.root);
    body.rotation.set(-1.35, .7, 0, 'YXZ'); chest.rotation.set(.17, .05, -.07);
    alignArchangelWings(w, body, -1.35); body.updateMatrixWorld(true);
    const normal = new Vector3(0, 1, 0).applyQuaternion(w.root.getWorldQuaternion(new Quaternion())); expect(normal.y).toBeGreaterThan(.999);
    body.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(Math.sin(.7), 0, Math.cos(.7)), .30)); alignArchangelWings(w, body, -1.35); body.updateMatrixWorld(true);
    expect(new Vector3(0, 1, 0).applyQuaternion(w.root.getWorldQuaternion(new Quaternion())).distanceTo(normal)).toBeGreaterThan(.2); w.dispose();
  });
});
