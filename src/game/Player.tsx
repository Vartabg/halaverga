import { useEffect, useRef } from 'react';
import { RigidBody, CapsuleCollider, useRapier, useBeforePhysicsStep, type RapierRigidBody, type RapierCollider } from '@react-three/rapier';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGame, persistGame } from './store';
import { runtime, readIntent, clearInput } from './runtime';
import { advanceVelocity, boundMovement, landingVelocity, moving, START, FOOT } from './motion';
const direction = new Vector3();
export default function Player() {
  const body = useRef<RapierRigidBody>(null), collider = useRef<RapierCollider>(null);
  const { world, rapier } = useRapier(), { camera } = useThree();
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const tick = useRef(0), liftTime = useRef(0), savedTime = useRef(0);
  const spawn = useRef(useGame.getState().checkpoint);
  useEffect(() => {
    const c = world.createCharacterController(.015); c.setSlideEnabled(true);
    c.enableAutostep(.35, .2, true); c.enableSnapToGround(.3);
    controller.current = c;
    runtime.position.set(spawn.current.x, spawn.current.y, spawn.current.z);
    useGame.setState({ ready: true });
    return () => { controller.current = null; world.removeCharacterController(c); };
  }, [world]);
  useBeforePhysicsStep(() => {
    const b = body.current, col = collider.current, c = controller.current;
    const state = useGame.getState(); if (!b || !col || !c || state.paused) return;
    const dt = 1 / 60;
    if (runtime.reset) {
      b.setTranslation(START, true); b.setNextKinematicTranslation(START); runtime.position.set(START.x, START.y, START.z);
      clearInput(true); runtime.reset = false; runtime.yaw = 0; runtime.pitch = -.12;
      useGame.setState({ flying: false, landing: false, checkpoint: START }); persistGame(); return;
    }
    const p = b.translation(), intent = readIntent();
    const k = runtime.keys;
    runtime.yaw += (Number(k.has('ArrowLeft')) - Number(k.has('ArrowRight'))) * dt * 1.5;
    runtime.pitch = Math.max(-1.3, Math.min(1.25, runtime.pitch + (Number(k.has('ArrowUp')) - Number(k.has('ArrowDown'))) * dt * 1.2));
    if (runtime.landGoal && moving(intent)) { runtime.landGoal = null; useGame.setState({ landing: false }); }
    let flying = state.flying;
    if (runtime.lift) {
      runtime.lift = false;
      if (!flying) { flying = true; liftTime.current = .4; runtime.velocity.y = 6; useGame.setState({ flying: true }); }
      else if (runtime.landGoal) { runtime.landGoal = null; useGame.setState({ landing: false }); }
      else if (runtime.landTarget) { runtime.landGoal = runtime.landTarget.clone().add(new Vector3(0, FOOT, 0)); useGame.setState({ landing: true }); }
      else useGame.setState({ message: 'Aim at a nearby flat rooftop or terrace to land.' });
    }
    const v = runtime.landGoal ? landingVelocity(p, runtime.landGoal) : advanceVelocity(runtime.velocity, intent, runtime.yaw, runtime.pitch, flying, runtime.surge, dt);
    if (liftTime.current > 0) { v.y = 6; liftTime.current -= dt; }
    runtime.velocity.set(v.x, v.y, v.z);
    if (flying) c.disableSnapToGround(); else c.enableSnapToGround(.3);
    const movement = boundMovement(p, { x: v.x * dt, y: v.y * dt, z: v.z * dt }, flying);
    c.computeColliderMovement(col, movement);
    const actual = c.computedMovement();
    if (!flying && c.computedGrounded() && runtime.velocity.y < 0) runtime.velocity.y = 0;
    const next = { x: p.x + actual.x, y: p.y + actual.y, z: p.z + actual.z };
    b.setNextKinematicTranslation(next); runtime.position.set(next.x, next.y, next.z);
    if (runtime.landGoal && runtime.position.distanceTo(runtime.landGoal) < .06) {
      runtime.landGoal = null; runtime.velocity.set(0, 0, 0); flying = false;
      useGame.setState({ flying: false, landing: false, checkpoint: next, message: 'Landed. Take a moment. Look around.' }); persistGame();
    }
    // Falling off an edge deploys the suit automatically, including over water.
    if (!flying && (!c.computedGrounded() && v.y < -5 || next.y < 1.8)) {
      runtime.velocity.y = 0; useGame.setState({ flying: true });
    }
    if (!flying && c.computedGrounded() && !moving(intent)) {
      savedTime.current += dt;
      if (savedTime.current > 2) { useGame.setState({ checkpoint: next }); persistGame(); savedTime.current = 0; }
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
        if (target.y > 1 && target.distanceTo(runtime.position) < 30) runtime.landTarget = target;
      }
      const nearTerminal = runtime.position.distanceTo(new Vector3(-7, 21, 58)) < 5;
      runtime.location = nearTerminal ? 'Municipal terminal' : next.y > 50 ? 'Upper skyline' : next.y < 6 ? 'Flooded boulevard' : next.z < 15 ? 'Broken viaduct' : 'Arrival terrace';
      useGame.setState({ canLand: !!runtime.landTarget, nearTerminal });
    }
  });
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.current.x, spawn.current.y, spawn.current.z]}>
    <CapsuleCollider ref={collider} args={[.6, .4]} />
  </RigidBody>;
}
