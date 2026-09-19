import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { FlightSafety } from '../src/game/FlightSafety';
import { boundMovement, landingVelocity, WORLD, type Vec } from '../src/game/motion';
import { CLEARANCE, removeInward, softenBounds } from '../src/game/navigation';
import { drive, keyboard, peak, type Body, type Device, type Options } from './flight-drive';
const worlds: RAPIER.World[] = [];
beforeAll(async () => { await RAPIER.init(); });
afterEach(() => { worlds.splice(0).forEach(w => w.free()); });
/** Player.tsx's flight step after the controls: softenBounds, FlightSafety.anticipate, the controller sweep, removeInward per hit. */
function city(start: Vec, facade?: number) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); worlds.push(world);
  if (facade !== undefined) {
    // A flat facade 60 m ahead, meeting the travel (along -z) at `facade` radians.
    const n = { x: Math.cos(facade), z: Math.sin(facade) };
    world.createCollider(RAPIER.ColliderDesc.cuboid(.5, 60, 400).setTranslation(start.x - n.x * .5, start.y, start.z - 60 - n.z * .5)
      .setRotation(new Quaternion().setFromEuler(new Euler(0, -facade, 0))));
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
  const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(.6, .4), body), c = world.createCharacterController(CLEARANCE.margin);
  c.setSlideEnabled(true); c.disableSnapToGround(); c.disableAutostep(); c.setMaxSlopeClimbAngle(Math.PI / 2); c.setMinSlopeSlideAngle(0);
  world.step();
  const safety = new FlightSafety(world, RAPIER, capsule);
  let contacts = 0;
  const step = (b: Body) => {
    const p = body.translation(), a = safety.anticipate(p, softenBounds(p, b.v)); let v = a.velocity; if (a.contact) contacts++;
    c.computeColliderMovement(capsule, boundMovement(p, { x: v.x / 60, y: v.y / 60, z: v.z / 60 }, true));
    for (let i = 0; i < c.numComputedCollisions(); i++) v = removeInward(v, c.computedCollision(i)!.normal1);
    const m = c.computedMovement(); b.v = v; body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); world.step();
  };
  return { step, contacts: () => contacts, at: () => body.translation() };
}
/** Largest |roll| and the travel's total turn (deg) with the flight safety answering each step. */
function graze(device: Device, start: Vec, yaw: number, facade?: number, options: Options = {}) {
  const w = city(start, facade); let top = 0, first: Vec | null = null, last: Vec = { x: 0, y: 0, z: 0 };
  drive(device, { seconds: 6, ...options, step: b => {
    if (!first) { b.yaw = yaw; const s = Math.hypot(b.v.x, b.v.z); b.v = { x: -Math.sin(yaw) * s, y: b.v.y, z: -Math.cos(yaw) * s }; first = b.v; }
    w.step(b); last = b.v;
  } }, f => { top = Math.max(top, Math.abs(f.roll)); });
  const turned = (Math.atan2(-last.x, -last.z) - Math.atan2(-first!.x, -first!.z)) * 180 / Math.PI;
  return { top, turned, contacts: w.contacts() };
}
describe('the turn roll counts the turns the controls make, not the ones the world makes', () => {
  it('does not bank away from a facade or the district edge the flight safety slides it along, view held still', () => {
    const report: string[] = [];
    for (const speed of [13, 34] as const) for (const hz of [30, 60, 144]) {
      for (const deg of [30, 45]) {
        const g = graze({ speed, pointer: false }, { x: 0, y: 50, z: 0 }, 0, deg * Math.PI / 180, { hz });
        report.push(`facade ${deg} deg ${speed} m/s ${hz} Hz: roll ${g.top.toFixed(3)}, travel turned ${g.turned.toFixed(1)} deg, ${g.contacts} steps steered`);
        expect(Math.abs(g.turned), 'the safety bends the travel').toBeGreaterThan(deg - 5); expect(g.top).toBeLessThan(.05);
      }
      // Toward the +x edge at 45 degrees: softenBounds alone bends the travel.
      const e = graze({ speed, pointer: false }, { x: WORLD.maxX - 30, y: 50, z: 0 }, -Math.PI / 4, undefined, { hz });
      report.push(`district edge 45 deg ${speed} m/s ${hz} Hz: roll ${e.top.toFixed(3)}, travel turned ${e.turned.toFixed(1)} deg`);
      expect(Math.abs(e.turned)).toBeGreaterThan(40); expect(e.top).toBeLessThan(.05);
    }
    if (process.env.ROLL_REPORT) console.log(report.join('\n'));
  });
  it('still banks for a turn the player makes along the facade, once the wall lets go', () => {
    // Slide along a 45-degree facade, then turn away from it with the arrows at 3 s.
    const g = graze({ ...keyboard(34, -1, 3, 4.5) }, { x: 0, y: 50, z: 0 }, 0, Math.PI / 4);
    if (process.env.ROLL_REPORT) console.log(`turn away from the facade at 34 m/s: roll ${g.top.toFixed(3)}`);
    expect(g.top).toBeGreaterThan(.5);
  });
  it('weighs a one-step turn of the travel the same at every frame rate', () => {
    // The landing approach replaces the velocity with one aimed at the goal in a single step (Player.tsx, landingVelocity).
    const land = (hz: number) => { let at = { x: 0, y: 0, z: 0 };
      return peak({ speed: 13, pointer: false }, { hz, seconds: 2.5, steer: b => {
        if (b.t >= 1) b.v = landingVelocity(at, { x: -10, y: 0, z: -20 });
        at = { x: at.x + b.v.x / 60, y: at.y + b.v.y / 60, z: at.z + b.v.z / 60 };
      } }); };
    // Clamped to 45 m/s^2 per step, the one-step turn only twitches the roll.
    const base = land(60), lines = [`landing turn at 60 Hz ${base.toFixed(3)}`]; expect(Math.abs(base)).toBeLessThan(.15);
    for (const hz of [30, 40, 144]) {
      const top = land(hz); lines.push(`${hz} Hz ${top.toFixed(3)}`);
      expect(Math.abs(top - base), `${hz} Hz`).toBeLessThan(.01);
    }
    if (process.env.ROLL_REPORT) console.log(lines.join(' · '));
  });
});
