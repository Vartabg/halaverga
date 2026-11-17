import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3 } from 'three';
import { ELITE, ELITES } from '@/game/encounter';
import { banish, MODE } from '@/game/banishState';
import { droneAlive } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { battle } from '@/game/celestialBattle';
import { useGame } from '@/game/store';
const matrix = new Matrix4(), at = new Vector3(), scale = new Vector3(), q = new Quaternion(), spin = new Quaternion(), axis = new Vector3(0, 0, 1), color = new Color();
/** One pooled draw for warden armor. Broken bands peel away; no new camera, physics body or character asset. */
export default function EliteGuard() {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(new TorusGeometry(1.35, .055, 5, 24, Math.PI * .7),
      new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending }), 6);
    m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < 6; i++) m.setColorAt(i, color); m.count = 0; return m;
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); mesh.dispose(); }, [mesh]);
  useFrame(({ camera }) => {
    const b = banish, f = runtime.shooter.drones, reduced = useGame.getState().reduced; let count = 0;
    for (const i of ELITES) {
      if (!droneAlive(f, i) || b.mode[i] >= MODE.down) continue;
      const p = runtime.shooter.targets[i].c, recovery = b.guardTime[i], breaking = recovery > ELITE.exchange - .55;
      const bands = Math.max(1, b.armor[i]);
      for (let n = 0; n < bands; n++) {
        at.set(p.x, p.y + .3, p.z);
        const peel = breaking && !reduced ? 1 + (ELITE.exchange - recovery) * .5 : 1;
        scale.setScalar(peel); q.copy(camera.quaternion).multiply(spin.setFromAxisAngle(axis, n * Math.PI + .45));
        mesh.setMatrixAt(count, matrix.compose(at, q, scale));
        color.set(battle.charging === i ? '#ffe8a1' : b.armor[i] > 0 ? '#d89766' : '#fff3d6').multiplyScalar(b.armor[i] > 0 ? .9 : .35);
        mesh.setColorAt(count++, color);
      }
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true;
  }, -4);
  return <primitive object={mesh} dispose={null} />;
}
