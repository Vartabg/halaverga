import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { runtime } from './runtime';
import { presentation as pose, advanceFlightPose, type PoseInput } from './presentation';
import { useGame } from './store';
export default function FlightPresentation() {
  const wasPaused = useRef(true);
  const input = useRef<PoseInput>({ yaw: 0, pitch: 0, speed: 0, velocity: runtime.velocity, flying: false, reduced: false });
  useFrame((_, elapsed) => {
    const state = useGame.getState(), dt = Math.min(elapsed, .05);
    if (pose.anchor) pose.anchor.getWorldPosition(pose.position);
    else pose.position.copy(runtime.position);
    if (pose.epoch !== runtime.poseEpoch) {
      Object.assign(pose, { viewYaw: runtime.yaw, viewPitch: runtime.pitch, yaw: runtime.yaw, lean: 0, bank: 0, speed: 0, flight: 0, brake: 0, epoch: runtime.poseEpoch, alignAfterReset: true });
    }
    if (pose.alignAfterReset) {
      // Do not interpolate across a checkpoint teleport while Rapier replaces its previous step.
      if (pose.position.distanceTo(runtime.position) > .1) pose.position.copy(runtime.position);
      else pose.alignAfterReset = false;
    }
    if (state.paused) { wasPaused.current = true; return; }
    if (wasPaused.current) {
      Object.assign(pose, { speed: runtime.velocity.length(), brake: 0, lean: 0, bank: 0, flight: state.flying ? 1 : 0 });
      wasPaused.current = false;
    }
    const target = input.current;
    target.yaw = runtime.yaw; target.pitch = runtime.pitch; target.speed = runtime.speed;
    target.flying = state.flying; target.reduced = state.reduced;
    advanceFlightPose(pose, target, dt);
  }, -30);
  return null;
}
