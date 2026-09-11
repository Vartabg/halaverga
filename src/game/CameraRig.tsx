import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, Vector3, Quaternion, MathUtils, type Mesh } from 'three';
import { runtime } from './runtime';
import { presentation as pose } from './presentation';
import { useGame } from './store';
const rotation = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), desired = new Vector3(), dir = new Vector3(), head = new Vector3();
const statKeys = ['drawCalls', 'triangles', 'geometries', 'textures'] as const;
const identity = { x: 0, y: 0, z: 0, w: 1 };
export default function CameraRig() {
  const { world, rapier } = useRapier();
  const initialized = useRef(false), epoch = useRef(-1), marker = useRef<Mesh>(null);
  const boom = useRef(new Vector3()), probe = useMemo(() => new rapier.Ball(.28), [rapier]);
  useFrame(({ camera, invalidate, gl }, dt) => {
    const state = useGame.getState();
    if (!state.ready) { invalidate(); return; }
    if (state.paused && initialized.current) return;
    const elapsed = Math.min(dt, .05);
    rotation.set(pose.viewPitch, pose.viewYaw, 0); q.setFromEuler(rotation);
    head.copy(pose.position); head.y += .65;
    desired.set(state.camera === 'third' ? .85 : 0, state.camera === 'third' ? .7 : 0, state.camera === 'third' ? 5.3 : 0).applyQuaternion(q);
    const snap = state.reduced || !initialized.current || epoch.current !== runtime.poseEpoch;
    boom.current.lerp(desired, snap ? 1 : 1 - Math.exp(-12 * elapsed));
    const length = boom.current.length();
    if (length > .05) {
      dir.copy(boom.current).divideScalar(length);
      const hit = world.castShape(head, identity, dir, probe, .04, length, false, undefined, undefined, undefined, undefined, col => col.parent()?.isFixed() ?? true);
      if (hit) boom.current.setLength(Math.max(0, hit.time_of_impact - .08));
    }
    // Both camera and suit consume the same interpolated anchor. Only the boom eases.
    camera.position.copy(head).add(boom.current); camera.quaternion.copy(q);
    runtime.cameraDistance = camera.position.distanceTo(pose.position);
    if ('fov' in camera) {
      const c = camera as import('three').PerspectiveCamera;
      c.fov = MathUtils.damp(c.fov, state.reduced ? 65 : 65 + Math.min(pose.speed / 17, 2), 3, elapsed);
      c.updateProjectionMatrix();
    }
    initialized.current = true; epoch.current = runtime.poseEpoch;
    if (marker.current) {
      marker.current.visible = !!runtime.landTarget && state.flying;
      if (runtime.landTarget) { marker.current.position.copy(runtime.landTarget); marker.current.position.y += .04; }
    }
    if (state.started && !state.paused) {
      if (!runtime.skipSample) { runtime.frames[runtime.frameIndex++ % 18000] = dt * 1000; runtime.elapsed += dt; }
      runtime.skipSample = false;
      const resources = runtime.resources;
      resources.drawCalls = gl.info.render.calls; resources.triangles = gl.info.render.triangles;
      resources.geometries = gl.info.memory.geometries; resources.textures = gl.info.memory.textures;
      for (const key of statKeys) runtime.peakResources[key] = Math.max(runtime.peakResources[key], runtime.resources[key]);
      invalidate();
    }
  }, -10);
  return <mesh ref={marker} visible={false} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.65, .82, 32]} /><meshBasicMaterial color="#e6ffc1" side={2} /></mesh>;
}
