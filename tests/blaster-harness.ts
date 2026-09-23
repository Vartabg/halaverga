import { Euler, Vector3, type Group, type Object3D } from 'three';
import { createShooter, pressFire, releaseFire, type ShooterState } from '../src/game/combat';
import { CHASE_BOOM, CHASE_HEAD } from '../src/game/presentation';
import { createAssistMemory } from '../src/game/aimAssist';
import { createDroneSim } from '../src/game/drones';
import { resetBurst } from '../src/game/burst';
import { clearShooterFault } from '../src/game/shooterFault';
import { createStepContext, stepShooter, type AudioSink } from '../src/game/shooterStep';
import type { ShooterWorld } from '../src/game/shotResolve';
import { buildArmCannon, stepArmCannon, type ArmCannon } from '../src/world/cannonRuntime';
import { cannonDrive, cannonLink, restCannonDrive } from '../src/world/cannonContract';
import { buildSkinnedSuit } from '../src/world/skinnedSuit';
import { createSuitAnimation } from '../src/world/suitAnimation';
import { createBlasterFrame, stepSuitBlaster, type BlasterFrame } from '../src/world/suitBlaster';
import { cruising, flightPose, frame, settledMix } from './flight-harness';
import { loadCannon } from './load-cannon';
import { loadSuit } from './load-suit';
/** The blaster pipeline Suit, Shooter and ArmCannon run each frame, on the real suit.glb and arm-cannon.glb, in node. */
export type Stance = 'ground' | 'hover' | 'cruise';
export type Harness = {
  rig: { root: Group; joints: Object3D[] }; cannon: ArmCannon; f: BlasterFrame; s: ShooterState; calls: string[];
  stance: Stance; viewYaw: number; viewPitch: number; hz: number; t: number; step: (fire?: boolean) => void;
};
const e = new Euler(0, 0, 0, 'YXZ'), world: ShooterWorld = { castShot: () => false, lineClear: () => true };
/** Publishes the chase camera ray as CameraRig does (hip boom), the body at the origin facing the view. */
function camera(s: ShooterState, viewYaw: number, viewPitch: number, f: BlasterFrame) {
  e.set(viewPitch, viewYaw, 0);
  const o = new Vector3(CHASE_BOOM.x, CHASE_BOOM.y, CHASE_BOOM.z).applyEuler(e).add(new Vector3(0, CHASE_HEAD, 0));
  const d = new Vector3(0, 0, -1).applyEuler(e), r = new Vector3(1, 0, 0).applyEuler(e), u = new Vector3(0, 1, 0).applyEuler(e);
  const a = s.aim; Object.assign(a.origin, { x: o.x, y: o.y, z: o.z }); Object.assign(a.dir, { x: d.x, y: d.y, z: d.z });
  Object.assign(a.right, { x: r.x, y: r.y, z: r.z }); Object.assign(a.up, { x: u.x, y: u.y, z: u.z }); a.valid = true; a.fov = 65;
  f.camera.x = o.x; f.camera.y = o.y; f.camera.z = o.z;
}
export async function loadAssets() {
  return { suit: (await loadSuit()).scene, cannon: (await loadCannon()).scene };
}
export function createHarness(assets: Awaited<ReturnType<typeof loadAssets>>, stance: Stance = 'ground', hz = 60, on = true): Harness {
  clearShooterFault(); resetBurst(); restCannonDrive();
  cannonLink.forearm = null; cannonLink.ready = false; cannonLink.handHidden = false; cannonLink.fxMuzzle.valid = cannonLink.ventMouth.valid = false;
  const rig = buildSkinnedSuit(assets.suit) as unknown as Harness['rig'], cannon = buildArmCannon(assets.cannon as Group);
  const s = createShooter(), f = createBlasterFrame(rig, s), calls: string[] = [];
  const sim = createDroneSim(s), mem = createAssistMemory(), ctx = createStepContext();
  const audio: AudioSink = kind => { calls.push(kind); };
  f.on = on; f.third = true; f.paused = false; f.reduced = false; f.epoch = 1; f.height = 0;
  const h: Harness = { rig, cannon, f, s, calls, stance, viewYaw: 0, viewPitch: 0, hz, t: 0, step: () => {} };
  h.step = (fire?: boolean) => {
    const dt = 1 / h.hz;
    if (fire === true && !s.input.fire) pressFire(s, 'touch');
    if (fire === false && s.input.fire) releaseFire(s, 'touch');
    camera(s, h.viewYaw, h.viewPitch, f);
    ctx.dt = dt; ctx.paused = false; ctx.reduced = f.reduced; ctx.flying = h.stance !== 'ground'; ctx.speed = h.stance === 'cruise' ? 20 : 0;
    ctx.head.x = 0; ctx.head.y = CHASE_HEAD; ctx.head.z = 0;
    if (f.on) stepShooter(s, sim, mem, world, ctx, audio);
    const p = poseRig(h, rig);
    f.flight = p.flight; f.speed = p.speed; f.ground = p.ground;
    stepSuitBlaster(f, dt);
    stepArmCannon(cannon, cannonLink, cannonDrive);
    h.t += dt;
  };
  return h;
}
/** One Suit.tsx frame of the base layers (no blaster) for the harness's stance and view, on any rig. */
export function poseRig(h: Pick<Harness, 'stance' | 'viewYaw' | 'viewPitch' | 't' | 'f'>, rig: { root: Group; joints: Object3D[] }) {
  const cruise = h.stance === 'cruise', speed = cruise ? 20 : 0;
  const p = flightPose({ speed, viewYaw: h.viewYaw, viewPitch: h.viewPitch, yaw: h.viewYaw, pitch: cruise ? h.viewPitch : 0, flight: h.stance === 'ground' ? 0 : 1 });
  const life = h.stance === 'ground' ? Object.assign(createSuitAnimation(), { epoch: 0, flying: false, ground: 1, time: h.t }) : cruising(h.t);
  const v = { x: -Math.sin(h.viewYaw) * speed, y: 0, z: -Math.cos(h.viewYaw) * speed };
  frame(rig as never, p, settledMix(p, v, h.f.reduced, h.stance !== 'ground'), life, 1, h.f.reduced);
  return { flight: p.flight, speed, ground: life.ground };
}
/** Steps until the carry has settled, the cannon is attached and the hand is hidden. */
export function settle(h: Harness, seconds = 1.5) { for (let i = 0; i < Math.round(seconds * h.hz); i++) h.step(false); }
