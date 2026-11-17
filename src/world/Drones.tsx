import EliteGuard from './EliteGuard';
import WardenAttacks from './WardenAttacks';
import { WA } from '@/game/banishState';
import { useEffect, useMemo } from 'react';
import { useFrame, useLoader, type RootState } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Color, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3,
  type BufferGeometry, type Camera, type Material, type PerspectiveCamera } from 'three';
import { MAX_DRONES, PHASE, droneAlive, mulberry32 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { battle } from '@/game/celestialBattle';
import { DRONE } from '@/game/droneDodge';
import { PATROLS } from '@/game/dronePatrols';
import { DRONE_COLORS, buildDroneGeometry, createDroneMaterials, minWorldSize } from './droneMesh';
import { ADVERSARY_URL } from './Suit';
import { createDemonActors, type DemonPose } from './demonActors';
import { blowOf } from './watcherClips';
import { banish, MODE } from '@/game/banishState';
import { WATCHER_LOOK } from './watcherLook';
// The Watchers (docs/plans/2026-11-16-real-fight.md B7): eight skinned watcher.glb bodies (demonActors.ts) and, pooled for all
// eight, the dark feather wings (two draws), the bronze blades, the eye markers, halos and telegraph rings (watcherGeometry.ts).
// Damage reads in stages on the Watcher itself: broken (4 HP and under: the cuirass is gone, the body and wings glow ember, the
// eye pulses slowly at 1.5 Hz), failing (2 HP and under: the glow deepens, the eye drops out at 1.5 Hz, and the body wobbles and
// sags as its wing power fades). Dying (the 80 ms hit-stop): the body jitters and, when the kill flash passed its gate, the eye halo swells white
// into the pop. All pulses stay at 1.5 Hz (WCAG 2.3.1: at most 3 flashes per second); reduced motion holds every pulse steady.
const HALO_RANGE = 85, TELEGRAPH = .22, DYING = .08, PULSE_HZ = 1.5, WOBBLE = { x: .12, z: .16, hzX: 1.3, hzZ: .9, sag: .08, sagHz: .7 };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
const zero = new Vector3(0, 0, 0), shake = new Vector3();
const idle = new Color(DRONE_COLORS.eyeIdle), alert = new Color(DRONE_COLORS.eyeAlert), tele = new Color(DRONE_COLORS.telegraph);
const white = new Color(DRONE_COLORS.flash), c = new Color(), glow = new Color();
const jitter = mulberry32(0xd40e);

function instanced(geometry: BufferGeometry, material: Material, colored: boolean) {
  const mesh = new InstancedMesh(geometry, material, MAX_DRONES);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  if (colored) {
    for (let i = 0; i < MAX_DRONES; i++) mesh.setColorAt(i, idle);
    mesh.instanceColor!.setUsage(DynamicDrawUsage);
  }
  mesh.count = 0;
  return mesh;
}
const place = (mesh: InstancedMesh, i: number, at: Vector3, rot: Quaternion, scale: Vector3) => mesh.setMatrixAt(i, m4.compose(at, rot, scale));
const phaseColor = (ph: number) => ph === PHASE.telegraph ? tele : ph === PHASE.alert || ph === PHASE.dodge || ph === PHASE.punish ? alert : idle;

export default function Drones() {
  const asset = useLoader(GLTFLoader, ADVERSARY_URL);
  const parts = useMemo(() => {
    const geo = buildDroneGeometry(), mat = createDroneMaterials();
    const actors = createDemonActors(asset.scene, asset.animations);
    const flash = new InstancedBufferAttribute(new Float32Array(MAX_DRONES), 1).setUsage(DynamicDrawUsage);
    const damage = new InstancedBufferAttribute(new Float32Array(MAX_DRONES), 1).setUsage(DynamicDrawUsage);
    for (const g of [geo.wingL, geo.wingR]) { g.setAttribute('aFlash', flash); g.setAttribute('aDamage', damage); }
    const meshes = {
      left: instanced(geo.wingL, mat.feather, true), right: instanced(geo.wingR, mat.feather, true), blade: instanced(geo.blade, mat.blade, false),
      eye: instanced(geo.eye, mat.eye, true), halo: instanced(geo.halo, mat.halo, true), ring: instanced(geo.halo, mat.ring, true),
    };
    const looks = PATROLS.map(p => WATCHER_LOOK[p.role]), featherTint = new Color();
    for (const [i, look] of looks.entries()) {
      featherTint.set(look.wing);
      meshes.left.setColorAt(i, featherTint); meshes.right.setColorAt(i, featherTint);
      for (const material of actors.actors[i].materials) {
        if (material.name === 'watcher chiton') material.color.set(look.cloth);
      }
    }
    meshes.halo.renderOrder = meshes.ring.renderOrder = 1;
    return { geo, mat, actors, looks, actorPose: { time: 0, charging: false, hit: 0, down: false, reduced: false, damage: 0 } as DemonPose, flash, damage, meshes, lastPositions: new Float64Array(MAX_DRONES * 3), airspeed: new Float32Array(MAX_DRONES), list: Object.values(meshes) };
  }, [asset]);
  useEffect(() => () => {
    parts.actors.dispose(); parts.list.forEach(mesh => mesh.dispose());
    Object.values(parts.geo).forEach(g => g.dispose()); parts.mat.dispose();
  }, [parts]);
  const frame = useMemo(() => guarded('Drones', (state: RootState, delta: number) => {
    const f = runtime.shooter.drones, { blade, left, right, eye: eyes, halo, ring } = parts.meshes, flash = parts.flash.array as Float32Array;
    const { lastPositions, airspeed, looks } = parts;
    const damage = parts.damage.array as Float32Array;
    const cam: Camera = state.camera, fov = (cam as PerspectiveCamera).isPerspectiveCamera ? (cam as PerspectiveCamera).fov : runtime.shooter.aim.fov;
    const h = state.gl.domElement.clientHeight || state.size.height || 1, t = runtime.shooter.clock, reduced = useGame.getState().reduced;
    const n = Math.min(f.count, MAX_DRONES);
    // Wings, blades and eyes stay indexed by drone (aFlash is shared by index). Halo and ring are compacted into the first slots
    // that are actually shown, so a pool with nothing to show issues no draw call.
    eyes.count = left.count = right.count = blade.count = n;
    for (let i = n; i < MAX_DRONES; i++) parts.actors.actors[i].root.visible = false;
    let hk = 0, rk = 0;
    for (let i = 0; i < n; i++) {
      const ph = f.phase[i], dead = ph === PHASE.dead, alive = droneAlive(f, i), pos = f.pos[i], kn = f.knock[i];
      const look = looks[i];
      shake.set(0, 0, 0);
      if (ph === PHASE.dying) {
        const amp = .04 * Math.max(0, 1 - f.phaseT[i] / DYING);
        shake.set((jitter() * 2 - 1) * amp, (jitter() * 2 - 1) * amp, (jitter() * 2 - 1) * amp);
      }
      const failing = alive && f.hp[i] <= DRONE.failAt, broken = alive && (f.broken[i] === 1 || f.hp[i] <= DRONE.breakAt);
      const pulse = Math.sin(2 * Math.PI * PULSE_HZ * t + i), wob = failing && !reduced ? 1 : 0;
      // Failing flight: a slow wobble and sag on top of the lean (visual only; the hit sphere stays on f.pos + knock).
      if (wob) shake.y -= WOBBLE.sag * (1 + Math.sin(2 * Math.PI * WOBBLE.sagHz * t + i));
      p.set(pos.x + kn.x, pos.y + kn.y, pos.z + kn.z).add(shake);
      e.set(f.tiltX[i] + .5 * f.pitch[i] + .5 * f.wobble[i] + wob * WOBBLE.x * Math.sin(2 * Math.PI * WOBBLE.hzX * t + i), f.yaw[i],
        f.tiltZ[i] + f.wobble[i] + wob * WOBBLE.z * Math.sin(2 * Math.PI * WOBBLE.hzZ * t + 2 * i), 'YXZ');
      q.setFromEuler(e);
      if (!useGame.getState().paused) {
        const k = i * 3, d = Math.hypot(pos.x - lastPositions[k], pos.y - lastPositions[k + 1], pos.z - lastPositions[k + 2]);
        const v = delta > 0 && d < 2 ? d / delta : 0; airspeed[i] += (v - airspeed[i]) * (1 - Math.exp(-4 * Math.min(.1, delta)));
        lastPositions[k] = pos.x; lastPositions[k + 1] = pos.y; lastPositions[k + 2] = pos.z;
        parts.mat.wings.step(i, t, airspeed[i], reduced, failing ? .8 : 0, look.wingRate);
      }
      flash[i] = Math.max(f.flash[i], f.tint[i]);
      damage[i] = failing ? (reduced ? .85 : .75 + .25 * pulse) : broken ? .45 : 0;
      const w = banish.wardens;
      Object.assign(parts.actorPose, { time: t, charging: battle.charging === i, hit: flash[i], hitT: t - f.lastHit[i], hitSide: banish.twist[i],
        blow: blowOf(banish, f.lastHit, i),
        attack: w.phase[i], attackTime: w.time[i], move: w.move[i], tell: w.tell[i], rush: w.duration[i],
        down: banish.mode[i] === MODE.down || banish.mode[i] === MODE.bound || banish.mode[i] === MODE.cast,
        reduced, damage: damage[i], airspeed: airspeed[i] });
      parts.actors.step(i, p, q, !dead, parts.actorPose);
      // The cuirass is the breakable plate (watcher.glb's `plate`).
      const actor = parts.actors.actors[i]; if (actor.plate) actor.plate.visible = look.armed && f.broken[i] !== 1;
      // Wings from the chest, the blade from the right fist and the eye marker from the head, as the body moves.
      if (dead || !look.armed) place(blade, i, p, q, zero);
      else blade.setMatrixAt(i, actor.bladeMatrix);
      if (dead) { place(left, i, p, q, zero); place(right, i, p, q, zero); place(eyes, i, p, q, zero); }
      else { left.setMatrixAt(i, actor.wingMatrix); right.setMatrixAt(i, actor.wingMatrix); eyes.setMatrixAt(i, actor.eyeMatrix); }
      p.setFromMatrixPosition(actor.eyeMatrix);
      c.copy(battle.charging === i || banish.wardens.phase[i] === WA.tell ? tele : phaseColor(ph)).lerp(white, Math.min(f.flash[i], .6));
      // The eye: a slow pulse once broken, 1.5 Hz dropouts once failing (reduced motion: a steady dim).
      if (failing) c.multiplyScalar(reduced ? .7 : .35 + .65 * smooth(-.25, .35, pulse));
      else if (broken) c.multiplyScalar(reduced ? .8 : .75 + .25 * pulse);
      eyes.setColorAt(i, c);
      const dist = p.distanceTo(cam.position);
      if (alive && dist <= HALO_RANGE) {
        place(halo, hk, p, cam.quaternion, s.setScalar(Math.max(.55, minWorldSize(6, dist, fov, h))));
        halo.setColorAt(hk++, glow.copy(c).multiplyScalar(.6));
      } else if (ph === PHASE.dying && f.flash[i] > .99 && dist <= HALO_RANGE) {
        // The pre-burst: the eye's halo swells white through the hit-stop, into the pop (only when the kill flash passed its gate).
        const u = Math.min(1, f.phaseT[i] / DYING);
        place(halo, hk, p, cam.quaternion, s.setScalar(Math.max(.55, minWorldSize(6, dist, fov, h)) * (1 + 1.6 * u)));
        halo.setColorAt(hk++, glow.copy(white).multiplyScalar(.6 + .6 * u));
      }
      if (alive && ph === PHASE.telegraph) {
        const k = Math.min(1, f.phaseT[i] / TELEGRAPH), base = Math.max(1, minWorldSize(14, dist, fov, h));
        place(ring, rk, p, cam.quaternion, s.setScalar(base * (reduced ? 1.6 : 1 + 1.4 * k)));
        ring.setColorAt(rk++, glow.copy(white).multiplyScalar(1 - .6 * k));
      }
    }
    halo.count = hk; halo.visible = hk > 0; ring.count = rk; ring.visible = rk > 0;
    for (let k = 0; k < parts.list.length; k++) parts.list[k].instanceMatrix.needsUpdate = true;
    eyes.instanceColor!.needsUpdate = halo.instanceColor!.needsUpdate = ring.instanceColor!.needsUpdate = true;
    parts.flash.needsUpdate = true; parts.damage.needsUpdate = true;
  }), [parts]);
  useFrame(frame, -5);
  return <group><EliteGuard /><WardenAttacks /><primitive object={parts.actors.group} dispose={null} />{parts.list.map((mesh, i) => <primitive key={i} object={mesh} dispose={null} />)}</group>;
}
