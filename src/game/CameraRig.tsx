import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, Vector3, Quaternion, type Mesh, type PerspectiveCamera } from 'three';
import { runtime } from './runtime';
import { presentation as pose, CHASE_HEAD } from './presentation';
import { baseFovStep, boomFor, CAM, fovFor, hipFovFor, shortWeight } from './cameraFx';
import { useGame } from './store';
const rotation = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), desired = new Vector3(), dir = new Vector3(), head = new Vector3();
const shakeEuler = new Euler(0, 0, 0, 'YXZ'), shake = new Quaternion(), axis = new Vector3();
// Speed-widened FOV, damped on its own so the ADS drop and shot punches never compound into the damp. Synced to c.fov on init.
// Short landscape screens get a narrower hip FOV and a closer boom (cameraFx.shortWeight); a hip change shifts baseFov, never glides.
let baseFov = NaN, lastHip = NaN, lastW = NaN;
const statKeys = ['drawCalls', 'triangles', 'geometries', 'textures'] as const;
const identity = { x: 0, y: 0, z: 0, w: 1 };
export default function CameraRig() {
  const { world, rapier } = useRapier();
  const initialized = useRef(false), epoch = useRef(-1), marker = useRef<Mesh>(null);
  const boom = useRef(new Vector3()), probe = useMemo(() => new rapier.Ball(.28), [rapier]);
  useFrame(({ camera, invalidate, gl, size }, dt) => {
    const state = useGame.getState();
    if (!state.ready) { invalidate(); return; }
    const persp = 'fov' in camera ? camera as PerspectiveCamera : null;
    const aspect = persp ? persp.aspect : 1, w = shortWeight(size.height, aspect), hip = hipFovFor(aspect, w);
    const resized = w !== lastW || hip !== lastHip;
    // Paused, the view stays frozen, except that a rotation or resize re-frames it once at zero elapsed time (no damp or spring moves).
    if (state.paused && initialized.current && !resized) return;
    const elapsed = state.paused ? 0 : Math.min(dt, .05), shooter = runtime.shooter, fx = shooter.camFx, aim = shooter.aim, reduced = state.reduced;
    const blend = reduced ? 0 : aim.blend;
    // Recoil kick joins the view; an idle kick adds nothing (adding a literal 0 could turn -0 into +0).
    rotation.set(fx.kickP === 0 ? pose.viewPitch : pose.viewPitch + fx.kickP, fx.kickY === 0 ? pose.viewYaw : pose.viewYaw + fx.kickY, 0);
    q.setFromEuler(rotation);
    head.copy(pose.position); head.y += CHASE_HEAD;
    if (state.camera === 'third') boomFor(blend, aspect, desired, w); else desired.set(0, 0, 0);
    desired.applyQuaternion(q);
    const snap = state.reduced || !initialized.current || epoch.current !== runtime.poseEpoch || resized;
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
    // The unshaken camera ray (kick included) for the shooter: shots, assist, drone perception and the suit aim read it.
    aim.origin.x = camera.position.x; aim.origin.y = camera.position.y; aim.origin.z = camera.position.z;
    axis.set(0, 0, -1).applyQuaternion(q); aim.dir.x = axis.x; aim.dir.y = axis.y; aim.dir.z = axis.z;
    axis.set(1, 0, 0).applyQuaternion(q); aim.right.x = axis.x; aim.right.y = axis.y; aim.right.z = axis.z;
    axis.set(0, 1, 0).applyQuaternion(q); aim.up.x = axis.x; aim.up.y = axis.y; aim.up.z = axis.z;
    aim.valid = true;
    // Kill shake: rotation only (no roll, no translation), after the ray and cameraDistance are published.
    if (fx.trauma > 0 && !reduced) { shakeEuler.set(fx.shakeP, fx.shakeY, 0); camera.quaternion.multiply(shake.setFromEuler(shakeEuler)); }
    if (persp) {
      const fresh = !initialized.current || !Number.isFinite(baseFov);
      if (fresh) baseFov = hip === CAM.hipFov ? persp.fov : hip;
      baseFov = baseFovStep(baseFov, fresh ? NaN : lastHip, hip, pose.speed, reduced, elapsed);
      persp.fov = fovFor(baseFov, blend, reduced, reduced ? 0 : fx.fovShot + fx.fovKill, hip);
      aim.hipFov = hip;
      persp.updateProjectionMatrix();
      aim.fov = persp.fov;
    }
    initialized.current = true; epoch.current = runtime.poseEpoch; lastW = w; lastHip = hip;
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
