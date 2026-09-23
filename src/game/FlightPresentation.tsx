import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { setVec } from './motion';
import { runtime } from './runtime';
import { presentation as pose, advanceFlightPose, aimDemand, type PoseInput } from './presentation';
import { useGame } from './store';
const rendered = new Vector3();
export default function FlightPresentation() {
  const wasPaused = useRef(true);
  const input = useRef<PoseInput>({ yaw: 0, pitch: 0, speed: 0, velocity: runtime.velocity, flying: false, reduced: false });
  useFrame((_, delta) => {
    const state = useGame.getState(), dt = Math.min(delta, .05);
    if (pose.anchor) pose.anchor.getWorldPosition(rendered);
    else rendered.copy(runtime.position);
    if (pose.epoch !== runtime.poseEpoch) {
      Object.assign(pose, { viewYaw: runtime.yaw, viewPitch: runtime.pitch, yaw: runtime.yaw, pitch: runtime.pitch, lean: 0, bank: 0, speed: 0, flight: 0, power: 0, brake: 0, aim: 0, epoch: runtime.poseEpoch, alignAfterReset: true });
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
    target.combat = state.shooter && aim.combat;
    advanceFlightPose(pose, target, dt);
  }, -30);
  return null;
}
