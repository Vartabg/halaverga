import { useEffect, useMemo } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { Color, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3,
  type BufferGeometry, type Camera, type Material, type PerspectiveCamera } from 'three';
import { MAX_DRONES, PHASE, droneAlive, eyeCenter, mulberry32, type Vec3 } from '@/game/combat';
import { guarded } from '@/game/shooterFault';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { DRONE_COLORS, buildDroneGeometry, createDroneMaterials, minWorldSize } from './droneMesh';

const HALO_RANGE = 85, TELEGRAPH = .22, DYING = .08;
const m4 = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), one = new Vector3(1, 1, 1);
const zero = new Vector3(0, 0, 0), eye: Vec3 = { x: 0, y: 0, z: 0 }, shake = new Vector3();
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
  const parts = useMemo(() => {
    const geo = buildDroneGeometry(), mat = createDroneMaterials();
    const flash = new InstancedBufferAttribute(new Float32Array(MAX_DRONES), 1).setUsage(DynamicDrawUsage);
    geo.body.setAttribute('aFlash', flash); geo.plate.setAttribute('aFlash', flash);
    const meshes = {
      body: instanced(geo.body, mat.body, false), plate: instanced(geo.plate, mat.plate, false), eye: instanced(geo.eye, mat.eye, true),
      halo: instanced(geo.halo, mat.halo, true), ring: instanced(geo.halo, mat.ring, true),
    };
    meshes.halo.renderOrder = meshes.ring.renderOrder = 1;
    return { geo, mat, flash, meshes, list: Object.values(meshes) };
  }, []);
  useEffect(() => () => {
    parts.list.forEach(mesh => mesh.dispose());
    parts.geo.body.dispose(); parts.geo.plate.dispose(); parts.geo.eye.dispose(); parts.geo.halo.dispose(); parts.mat.dispose();
  }, [parts]);
  const frame = useMemo(() => guarded('Drones', (state: RootState, _delta: number) => {
    const f = runtime.shooter.drones, { body, plate, eye: eyes, halo, ring } = parts.meshes, flash = parts.flash.array as Float32Array;
    const cam: Camera = state.camera, fov = (cam as PerspectiveCamera).isPerspectiveCamera ? (cam as PerspectiveCamera).fov : runtime.shooter.aim.fov;
    const h = state.gl.domElement.clientHeight || state.size.height || 1, t = runtime.shooter.clock, reduced = useGame.getState().reduced;
    const n = Math.min(f.count, MAX_DRONES);
    // Body, plate and eye stay indexed by drone (aFlash is shared by index). Halo and ring are compacted into the first slots
    // that are actually shown, so a pool with nothing to show issues no draw call.
    body.count = plate.count = eyes.count = n;
    let hk = 0, rk = 0;
    for (let i = 0; i < n; i++) {
      const ph = f.phase[i], dead = ph === PHASE.dead, alive = droneAlive(f, i), pos = f.pos[i], kn = f.knock[i];
      shake.set(0, 0, 0);
      if (ph === PHASE.dying) {
        const amp = .04 * Math.max(0, 1 - f.phaseT[i] / DYING);
        shake.set((jitter() * 2 - 1) * amp, (jitter() * 2 - 1) * amp, (jitter() * 2 - 1) * amp);
      }
      p.set(pos.x + kn.x, pos.y + kn.y, pos.z + kn.z).add(shake);
      e.set(f.tiltX[i] + .5 * f.pitch[i] + .5 * f.wobble[i], f.yaw[i], f.tiltZ[i] + f.wobble[i], 'YXZ');
      q.setFromEuler(e);
      const scale = dead ? zero : one;
      place(body, i, p, q, scale);
      place(plate, i, p, q, f.broken[i] === 1 ? zero : scale);
      flash[i] = Math.max(f.flash[i], f.tint[i]);
      eyeCenter(f, i, eye);
      p.set(eye.x, eye.y, eye.z).add(shake);
      place(eyes, i, p, q, scale);
      c.copy(phaseColor(ph)).lerp(white, Math.min(f.flash[i], .6));
      if (f.hp[i] <= 3) c.multiplyScalar(reduced ? .8 : .75 + .25 * Math.sin(2 * Math.PI * 1.5 * t));
      eyes.setColorAt(i, c);
      const dist = p.distanceTo(cam.position);
      if (alive && dist <= HALO_RANGE) {
        place(halo, hk, p, cam.quaternion, s.setScalar(Math.max(.9, minWorldSize(10, dist, fov, h))));
        halo.setColorAt(hk++, glow.copy(c).multiplyScalar(.6));
      }
      if (alive && ph === PHASE.telegraph) {
        const k = Math.min(1, f.phaseT[i] / TELEGRAPH), base = Math.max(1, minWorldSize(14, dist, fov, h));
        place(ring, rk, p, cam.quaternion, s.setScalar(base * (reduced ? 1.6 : 1 + 1.4 * k)));
        ring.setColorAt(rk++, glow.copy(white).multiplyScalar(1 - .6 * k));
      }
    }
    halo.count = hk; halo.visible = hk > 0; ring.count = rk; ring.visible = rk > 0;
    for (let k = 0; k < 5; k++) parts.list[k].instanceMatrix.needsUpdate = true;
    eyes.instanceColor!.needsUpdate = halo.instanceColor!.needsUpdate = ring.instanceColor!.needsUpdate = true;
    parts.flash.needsUpdate = true;
  }), [parts]);
  useFrame(frame, -5);
  return <group>{parts.list.map((mesh, i) => <primitive key={i} object={mesh} dispose={null} />)}</group>;
}
