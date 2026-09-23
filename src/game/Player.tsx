import { useEffect, useRef } from 'react';
import { RigidBody, CapsuleCollider, useRapier, useBeforePhysicsStep, type RapierRigidBody, type RapierCollider } from '@react-three/rapier';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGame, persistGame } from './store';
import { runtime, readIntent, clearInput, arrowLook } from './runtime';
import { advanceVelocity, boundMovement, landingVelocity, moving, setVec, START, FOOT } from './motion';
import { presentation } from './presentation';
import { edgeFreshness } from './trackpadFlight';
import { FlightSafety } from './FlightSafety';
import { boundaryDistance, CLEARANCE, nearestTerminal, removeInward, softenBounds } from './navigation';
import { sweepTurn } from './turnSweep';
import { moveMode } from './combat';
import { aimVelocity, hipVelocity } from './aimMotion';
const direction = new Vector3();
export default function Player() {
  const body = useRef<RapierRigidBody>(null), collider = useRef<RapierCollider>(null);
  const { world, rapier } = useRapier(), { camera } = useThree();
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const tick = useRef(0), liftTime = useRef(0), savedTime = useRef(0);
  const brakeEpoch = useRef(runtime.trackpad.brakeEpoch);
  const safety = useRef<FlightSafety | null>(null), warmup = useRef(0), landingStall = useRef(0);
  const paused = useGame(s => s.paused);
  const spawn = useRef(useGame.getState().checkpoint);
  useEffect(() => { if (paused) liftTime.current = 0; }, [paused]);
  useEffect(() => {
    const c = world.createCharacterController(CLEARANCE.margin); c.setSlideEnabled(true);
    c.enableAutostep(.35, .2, true); c.enableSnapToGround(.3);
    controller.current = c;
    setVec(runtime.position, spawn.current.x, spawn.current.y, spawn.current.z);
    runtime.poseEpoch++;
    useGame.setState({ ready: true });
    return () => { controller.current = null; world.removeCharacterController(c); };
  }, [world]);
  useBeforePhysicsStep(() => {
    const b = body.current, col = collider.current, c = controller.current;
    const state = useGame.getState(); if (!b || !col || !c || state.paused) return;
    const dt = 1 / 60;
    if (brakeEpoch.current !== runtime.trackpad.brakeEpoch) { liftTime.current = 0; brakeEpoch.current = runtime.trackpad.brakeEpoch; }
    if (!safety.current) safety.current = new FlightSafety(world, rapier, col);
    const safe = safety.current;
    // Allow Rapier's first broad-phase update before querying a persisted checkpoint.
    if (warmup.current++ === 0) return;
    const current = b.translation();
    if ((warmup.current === 2 && !safe.canLand({ ...current, y: current.y - FOOT })) || !safe.isClear(current)) {
      const checkpoint = safe.checkpoint(state.checkpoint);
      b.setTranslation(checkpoint, true); b.setNextKinematicTranslation(checkpoint);
      setVec(runtime.position, checkpoint.x, checkpoint.y, checkpoint.z); runtime.poseEpoch++;
      clearInput(true); liftTime.current = 0;
      useGame.setState({ flying: false, landing: false, checkpoint, message: 'Suit restored to a clear landing.' });
      return;
    }
    if (runtime.reset) {
      b.setTranslation(START, true); b.setNextKinematicTranslation(START); setVec(runtime.position, START.x, START.y, START.z);
      clearInput(true); runtime.reset = false; runtime.yaw = 0; runtime.pitch = -.12; runtime.poseEpoch++; liftTime.current = 0;
      useGame.setState({ flying: false, landing: false, checkpoint: START }); persistGame(); return;
    }
    const p = b.translation(), intent = readIntent();
    const k = runtime.keys;
    const pointerFlight = runtime.thumb.active || runtime.trackpad.active;
    if (pointerFlight) {
      const pointer = runtime.trackpad.active ? runtime.trackpad : runtime.thumb;
      runtime.trackpad.edgeAge += dt;
      const gain = runtime.trackpad.active && !state.sustainedEdges ? edgeFreshness(runtime.trackpad.edgeAge) : 1;
      runtime.yaw -= pointer.edgeTurn * dt * 1.5 * gain;
      runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch + pointer.edgePitch * dt * gain));
    }
    // Blaster on: arrows get a fine first step and the ADS gain (arrowLook). Off: main's exact lines, bit for bit.
    if (state.shooter) arrowLook(dt);
    else {
      runtime.yaw += (Number(k.has('ArrowLeft')) - Number(k.has('ArrowRight'))) * dt * 1.5;
      runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch + (Number(k.has('ArrowUp')) - Number(k.has('ArrowDown'))) * dt * 1.2));
    }
    if (runtime.landGoal && moving(intent)) { runtime.landGoal = null; useGame.setState({ landing: false }); }
    let flying = state.flying;
    if (runtime.lift || (pointerFlight && moving(intent) && !flying)) {
      runtime.lift = false;
      if (!flying) { flying = true; liftTime.current = .4; runtime.velocity.y = 6; useGame.setState({ flying: true }); }
      else if (runtime.landGoal) { runtime.landGoal = null; useGame.setState({ landing: false }); }
      else if (runtime.landTarget) { runtime.landGoal = runtime.landTarget.clone().add(new Vector3(0, FOOT, 0)); landingStall.current = 0; useGame.setState({ landing: true }); }
      else useGame.setState({ message: 'Aim at a nearby flat rooftop or terrace to land.' });
    }
    // PR #12: the one-finger 'simple' trackpad profile looks without thrusting; every other gesture still surges.
    const gestureThrust = runtime.thumb.active || (runtime.trackpad.active && state.trackpadSteering !== 'simple');
    const mode = state.shooter ? moveMode(runtime.shooter) : 0, surge = runtime.surge || gestureThrust;
    let v = runtime.landGoal ? landingVelocity(p, runtime.landGoal)
      : mode === 2 ? aimVelocity(runtime.velocity, intent, runtime.yaw, runtime.pitch, flying, dt)
      : mode === 1 ? hipVelocity(runtime.velocity, intent, runtime.yaw, runtime.pitch, flying, surge, dt)
      : advanceVelocity(runtime.velocity, intent, runtime.yaw, runtime.pitch, flying, surge, dt);
    if (liftTime.current > 0) { v.y = 6; liftTime.current -= dt; }
    const from = { ...runtime.velocity }, chosen = v;
    runtime.clearance.active = false; runtime.clearance.boundary = boundaryDistance(p) < 12;
    if (flying && !runtime.landGoal) {
      v = softenBounds(p, v);
      const anticipated = safe.anticipate(p, v); v = anticipated.velocity;
      if (anticipated.contact) {
        runtime.clearance.active = true;
        const w = anticipated.contact.witness1, n = new Vector3().copy(anticipated.contact.normal1).normalize();
        setVec(runtime.clearance.point, w.x, w.y, w.z); setVec(runtime.clearance.normal, n.x, n.y, n.z);
      }
    }
    setVec(runtime.velocity, v.x, v.y, v.z);
    if (flying) { c.disableSnapToGround(); c.disableAutostep(); c.setMaxSlopeClimbAngle(Math.PI / 2); c.setMinSlopeSlideAngle(0); }
    else { c.enableSnapToGround(.3); c.enableAutostep(.35, .2, true); c.setMaxSlopeClimbAngle(Math.PI / 4); c.setMinSlopeSlideAngle(Math.PI / 6); }
    const movement = boundMovement(p, { x: v.x * dt, y: v.y * dt, z: v.z * dt }, flying);
    c.computeColliderMovement(col, movement);
    const actual = c.computedMovement();
    for (let i = 0; i < c.numComputedCollisions(); i++) {
      const hit = c.computedCollision(i);
      if (hit) { const corrected = removeInward(runtime.velocity, hit.normal1); setVec(runtime.velocity, corrected.x, corrected.y, corrected.z); }
    }
    if (!flying && c.computedGrounded() && runtime.velocity.y < 0) runtime.velocity.y = 0;
    // The turn roll counts the turns the controls make, not the ones the flight safety or a wall makes.
    sweepTurn(runtime.turn, from, chosen, runtime.velocity, presentation.yaw, dt);
    const next = { x: p.x + actual.x, y: p.y + actual.y, z: p.z + actual.z };
    b.setNextKinematicTranslation(next); setVec(runtime.position, next.x, next.y, next.z);
    if (runtime.landGoal) {
      landingStall.current = Math.hypot(actual.x, actual.y, actual.z) < .002 ? landingStall.current + dt : 0;
      if (landingStall.current > .6) {
        runtime.landGoal = null; setVec(runtime.velocity, 0, 0, 0);
        useGame.setState({ landing: false, message: 'Approach blocked. Hovering clear of the surface.' });
      }
    }
    if (runtime.landGoal && runtime.landGoal.distanceTo(runtime.position) < .06) {
      runtime.landGoal = null; setVec(runtime.velocity, 0, 0, 0); flying = false;
      useGame.setState({ flying: false, landing: false, checkpoint: next, message: 'Landed. Take a moment. Look around.' }); persistGame();
    }
    // Falling off an edge deploys the suit automatically, including over water.
    if (!flying && (!c.computedGrounded() && v.y < -5 || next.y < 1.8)) {
      runtime.velocity.y = 0; useGame.setState({ flying: true });
    }
    if (!flying && c.computedGrounded() && !moving(intent)) {
      savedTime.current += dt;
      if (savedTime.current > 2) {
        if (safe.canLand({ ...next, y: next.y - FOOT })) { useGame.setState({ checkpoint: next }); persistGame(); }
        savedTime.current = 0;
      }
    }
    runtime.speed = Math.hypot(actual.x, actual.y, actual.z) / dt; runtime.altitude = Math.max(0, next.y - FOOT);
    tick.current += dt;
    if (tick.current > .15) {
      tick.current = 0; camera.getWorldDirection(direction);
      const ray = new rapier.Ray(camera.position, direction);
      const hit = world.castRayAndGetNormal(ray, 45, true, undefined, undefined, col);
      runtime.landTarget = null;
      if (hit && hit.normal.y > .75) {
        const target = new Vector3().copy(camera.position).addScaledVector(direction, hit.timeOfImpact);
        const goal = target.clone(); goal.y += FOOT;
        if (target.y > 1 && target.distanceTo(runtime.position) < 30 && safe.canLand(target) && safe.pathClear(runtime.position, goal)) runtime.landTarget = target;
      }
      const terminal = nearestTerminal(runtime.position);
      const nearTerminal = terminal !== null;
      runtime.location = terminal ? terminal.location : next.y > 50 ? 'Upper skyline' : next.y < 6 ? 'Flooded boulevard' : next.z < 15 ? 'Broken viaduct' : 'Arrival terrace';
      useGame.setState({ canLand: !!runtime.landTarget, nearTerminal, boundaryNear: runtime.clearance.boundary, clearanceActive: runtime.clearance.active });
    }
  });
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.current.x, spawn.current.y, spawn.current.z]}>
    <CapsuleCollider ref={collider} args={[.6, .4]} />
    <group ref={node => { presentation.anchor = node; }} />
  </RigidBody>;
}
