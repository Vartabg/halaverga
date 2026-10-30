import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { Euler, Vector3, Quaternion, type Mesh, type PerspectiveCamera } from 'three';
import { runtime } from './runtime';
import { presentation as pose, CHASE_HEAD } from './presentation';
import { baseFovStep, boomFor, CAM, fovFor, hipFovFor, shortWeight } from './cameraFx';
import { useGame } from './store';
import { boomBlocks } from './boomFilter';
import { gowRuntime } from './gowTypes';
const rotation = new Euler(0, 0, 0, 'YXZ'), q = new Quaternion(), desired = new Vector3(), dir = new Vector3(), head = new Vector3();
const shakeEuler = new Euler(0, 0, 0, 'YXZ'), shake = new Quaternion(), axis = new Vector3();
let baseFov = NaN, lastHip = NaN, lastW = NaN;
const statKeys = ['drawCalls', 'triangles', 'geometries', 'textures'] as const;
const identity = { x: 0, y: 0, z: 0, w: 1 };
export default function CameraRig() {
  const { world, rapier } = useRapier();
  const initialized = useRef(false), epoch = useRef(-1), marker = useRef<Mesh>(null), ecoTimer = useRef(0);
  const boom = useRef(new Vector3()), probe = useMemo(() => new rapier.Ball(.28), [rapier]);
  useEffect(() => () => { if (ecoTimer.current) window.clearTimeout(ecoTimer.current); }, []);
  useFrame(({ camera, invalidate, gl, size }, dt) => {
    const state = useGame.getState();
    if (!state.ready) { invalidate(); return; }
    const persp = 'fov' in camera ? camera as PerspectiveCamera : null;
    const aspect = persp ? persp.aspect : 1, w = shortWeight(size.height, aspect), hip = hipFovFor(aspect, w);
    const resized = w !== lastW || hip !== lastHip;
    if (state.paused && initialized.current && !resized) return;
    const elapsed = state.paused ? 0 : Math.min(dt, .05), shooter = runtime.shooter, fx = shooter.camFx, aim = shooter.aim, reduced = state.reduced;
    const blend = reduced ? 0 : aim.blend;
    const iso = state.shooter && state.camera === 'third';
    const diving = iso && gowRuntime.divePhase !== 'NONE';
    const baseP = diving ? -0.56 : iso ? -0.68 : pose.viewPitch, baseY = iso ? 0 : pose.viewYaw;
    rotation.set(fx.kickP === 0 ? baseP : baseP + fx.kickP, fx.kickY === 0 ? baseY : baseY + fx.kickY, 0);
    q.setFromEuler(rotation);
    head.copy(pose.position);
    if (iso && state.flying && !diving) head.y = Math.min(pose.position.y, 22.8);
    head.y += CHASE_HEAD;
    if (iso) {
      const k = w > 0 ? 1 - CAM.near * Math.min(w, 1) * 0.35 : 1;
      const zoom = gowRuntime.action !== 'idle' || gowRuntime.turnPhase === 'ENEMY_TURN' ? 2.0 : 0;
      const dist = diving ? 14.2 : (state.flying ? 18.8 : 15.2) - zoom;
      desired.set(0, 0, dist * k);
    } else if (state.camera === 'third') {
      boomFor(blend, aspect, desired, w);
    } else desired.set(0, 0, 0);
    desired.applyQuaternion(q);
    const snap = state.reduced || !initialized.current || epoch.current !== runtime.poseEpoch || resized;
    boom.current.lerp(desired, snap ? 1 : 1 - Math.exp(-10 * elapsed));
    const length = boom.current.length();
    if (length > .05 && !iso) {
      dir.copy(boom.current).divideScalar(length);
      const hit = world.castShape(head, identity, dir, probe, .04, length, false, undefined, undefined, undefined, undefined, boomBlocks);
      if (hit) boom.current.setLength(Math.max(0, hit.time_of_impact - .08));
    }
    camera.position.copy(head).add(boom.current); camera.quaternion.copy(q);
    runtime.cameraDistance = camera.position.distanceTo(pose.position);
    aim.origin.x = camera.position.x; aim.origin.y = camera.position.y; aim.origin.z = camera.position.z;
    axis.set(0, 0, -1).applyQuaternion(q); aim.dir.x = axis.x; aim.dir.y = axis.y; aim.dir.z = axis.z;
    axis.set(1, 0, 0).applyQuaternion(q); aim.right.x = axis.x; aim.right.y = axis.y; aim.right.z = axis.z;
    axis.set(0, 1, 0).applyQuaternion(q); aim.up.x = axis.x; aim.up.y = axis.y; aim.up.z = axis.z;
    aim.valid = true;
    if (fx.trauma > 0 && !reduced) { shakeEuler.set(fx.shakeP, fx.shakeY, 0); camera.quaternion.multiply(shake.setFromEuler(shakeEuler)); }
    if (persp) {
      const fresh = !initialized.current || !Number.isFinite(baseFov);
      if (fresh) baseFov = hip === CAM.hipFov ? persp.fov : hip;
      baseFov = baseFovStep(baseFov, fresh ? NaN : lastHip, hip, pose.speed, reduced, elapsed);
      persp.fov = fovFor(baseFov, blend, reduced, reduced ? 0 : fx.fovShot + fx.fovKill - (iso ? 8 : 0), hip);
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
      const anyMovingEnemy = gowRuntime.enemies.some(e => Math.hypot(e.vx, e.vz) > 0.1 || e.flashTimer > 0);
      const anyProjOrSpark = gowRuntime.projectiles.some(p => p.active) || gowRuntime.sparks.some(s => s.active);
      const isBurst = !iso || gowRuntime.action !== 'idle' || gowRuntime.turnPhase !== 'PLAYER_TURN' || gowRuntime.cutInTimer > 0 || gowRuntime.divePhase === 'DIVING' || gowRuntime.shockwaveTimer > 0 || gowRuntime.slashTimer > 0 || gowRuntime.sigilRibbonTimer > 0 || anyMovingEnemy || anyProjOrSpark || Math.hypot(runtime.velocity.x, runtime.velocity.y, runtime.velocity.z) > 0.12;
      gowRuntime.ecoMode = !isBurst;
      if (isBurst) {
        if (ecoTimer.current) { window.clearTimeout(ecoTimer.current); ecoTimer.current = 0; }
        invalidate();
      } else if (!ecoTimer.current) {
        ecoTimer.current = window.setTimeout(() => { ecoTimer.current = 0; runtime.skipSample = true; invalidate(); }, 80);
      }
    }
  }, -10);
  return <mesh ref={marker} visible={false} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.65, .82, 32]} /><meshBasicMaterial color="#e6ffc1" side={2} /></mesh>;
}
