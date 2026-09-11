import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, Vector3, Quaternion, MathUtils, type Mesh } from 'three';
import { runtime } from './runtime';
import { useGame } from './store';
const rotation = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), offset = new Vector3(), desired = new Vector3(), dir = new Vector3();
export default function CameraRig() {
  const { world, rapier } = useRapier();
  const initialized = useRef(false), marker = useRef<Mesh>(null);
  useFrame(({ camera, invalidate, gl }, dt) => {
    const state = useGame.getState();
    if (!state.ready) { invalidate(); return; }
    if (state.paused && initialized.current) return;
    const elapsed = Math.min(dt, .05);
    rotation.set(runtime.pitch, runtime.yaw, 0); q.setFromEuler(rotation);
    desired.copy(runtime.position).add(new Vector3(0, .65, 0));
    if (state.camera === 'third') {
      offset.set(.85, .7, 5.3).applyQuaternion(q);
      dir.copy(offset).normalize();
      // Sweep the whole boom; filtering avoids the camera hitting its own suit.
      const ray = new rapier.Ray(desired, dir);
      const hit = world.castRay(ray, offset.length(), true, undefined, undefined, undefined, undefined,
        col => col.parent()?.isFixed() ?? true);
      if (hit) offset.setLength(Math.max(.12, hit.timeOfImpact - .25));
      desired.add(offset);
    }
    const gain = state.reduced || !initialized.current ? 1 : 1 - Math.exp(-14 * elapsed);
    camera.position.lerp(desired, gain); camera.quaternion.slerp(q, gain);
    if ('fov' in camera) {
      const c = camera as import('three').PerspectiveCamera;
      c.fov = MathUtils.damp(c.fov, state.reduced ? 65 : 65 + Math.min(runtime.speed / 5, 5), 3, elapsed);
      c.updateProjectionMatrix();
    }
    initialized.current = true;
    if (marker.current) {
      marker.current.visible = !!runtime.landTarget && state.flying;
      if (runtime.landTarget) marker.current.position.copy(runtime.landTarget).add(new Vector3(0, .04, 0));
    }
    if (state.started && !state.paused) {
      if (!runtime.skipSample) {
        runtime.frames[runtime.frameIndex++ % 18000] = dt * 1000; runtime.elapsed += dt;
      }
      runtime.skipSample = false;
      runtime.resources = { drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
      for (const key of Object.keys(runtime.resources) as (keyof typeof runtime.resources)[]) runtime.peakResources[key] = Math.max(runtime.peakResources[key], runtime.resources[key]);
      invalidate();
    }
  });
  return <mesh ref={marker} visible={false} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.65, .82, 32]} /><meshBasicMaterial color="#e6ffc1" side={2} /></mesh>;
}
