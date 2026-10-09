import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { setVec } from './motion';
import { runtime } from './runtime';
import { presentation as pose, advanceFlightPose, aimDemand, CHASE_HEAD, FACING, type PoseInput } from './presentation';
import { useGame } from './store';
import { touchMode } from './pointerMode';
import { gesture } from './gesture/bus';
import { aimFacing, labFacing } from './gesture/aimFacing';
const rendered = new Vector3(), head = { x: 0, y: 0, z: 0 }, facing = { yaw: 0, pitch: 0 };
const FACING_REST = { yaw: FACING.yaw, up: FACING.pitchUp, down: FACING.pitchDown };
export default function FlightPresentation() {
  const wasPaused = useRef(true);
  const input = useRef<PoseInput>({ yaw: 0, pitch: 0, speed: 0, velocity: runtime.velocity, flying: false, reduced: false });
  useFrame((_, delta) => {
    const state = useGame.getState(), dt = Math.min(delta, .05);
    if (pose.anchor) pose.anchor.getWorldPosition(rendered);
    else rendered.copy(runtime.position);
    if (pose.epoch !== runtime.poseEpoch) {
      Object.assign(pose, { viewYaw: runtime.yaw, viewPitch: runtime.pitch, yaw: runtime.yaw, pitch: runtime.pitch, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0, aim: 0, spin: 0, epoch: runtime.poseEpoch, alignAfterReset: true });
      Object.assign(pose.bound, FACING_REST);
    }
    if (pose.alignAfterReset) {
      // Do not interpolate across a checkpoint teleport while Rapier replaces its previous step.
      if (rendered.distanceTo(runtime.position) > .1) rendered.copy(runtime.position);
      else pose.alignAfterReset = false;
    }
    setVec(pose.position, rendered.x, rendered.y, rendered.z);
    if (state.paused) { wasPaused.current = true; return; }
    if (wasPaused.current) {
      const v = runtime.velocity;
      Object.assign(pose, { speed: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), brake: 0, lean: 0, power: 0, bank: 0, aim: 0, flight: state.flying ? 1 : 0 });
      wasPaused.current = false;
    }
    const target = input.current;
    target.yaw = runtime.yaw; target.pitch = runtime.pitch; target.speed = runtime.speed;
    target.flying = state.flying; target.reduced = state.reduced;
    const aim = runtime.shooter.aim;
    // This frame's fire input counts, so the torso squares up on the press frame (the shooter step runs after this, at -25).
    target.aim = state.shooter ? aimDemand(runtime.shooter) : 0;
    // Twin-stick touch: the right thumb aims all the time, so the view settles at the fast combat rate.
    target.combat = state.shooter && aim.combat || touchMode() && state.touchScheme === 'twin';
    // Gesture Lab: the facing bounds (path or aimed burst), the aimed shot's offset from the view, and the body roll.
    const lab = gesture.scheme !== 'off';
    target.facing = labFacing(); target.spin = lab ? gesture.spin : 0;
    head.x = rendered.x; head.y = rendered.y + CHASE_HEAD; head.z = rendered.z;
    aimFacing(runtime.shooter, head, runtime.yaw, runtime.pitch, facing);
    target.aimYaw = facing.yaw; target.aimPitch = facing.pitch;
    advanceFlightPose(pose, target, dt);
  }, -30);
  return null;
}
