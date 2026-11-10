import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { AdditiveBlending, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { battle, BATTLE, resetBattle, stepBattle } from '@/game/celestialBattle';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { createShooterWorld, shotSegmentClear } from '@/game/shotResolve';

const m = new Matrix4(), q = new Quaternion(), at = new Vector3(), scale = new Vector3();
export default function Battle() {
  const { world, rapier } = useRapier();
  const ray = useMemo(() => createShooterWorld(world, rapier), [world, rapier]);
  const clearSegment = useMemo(() => (a: typeof runtime.position, b: typeof runtime.position) => shotSegmentClear(ray, a, b), [ray]);
  const mesh = useMemo(() => {
    const m = new InstancedMesh(new SphereGeometry(1, 10, 8), new MeshBasicMaterial({ color: '#ff4b22', toneMapped: false,
      transparent: true, opacity: .85, blending: AdditiveBlending, depthWrite: false }), BATTLE.bolts);
    m.frustumCulled = false; m.count = 0; return m;
  }, []);
  useEffect(() => { resetBattle(runtime.shooter.stats.kills); return () => { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); mesh.dispose(); }; }, [mesh]);
  useFrame((_, dt) => {
    const s = useGame.getState();
    stepBattle(battle, runtime.shooter, runtime.position, dt, !s.paused && s.flying, ray.lineClear, clearSegment);
    let n = 0;
    for (const bolt of battle.bolts) {
      if (!bolt.live) continue;
      at.set(bolt.p.x, bolt.p.y, bolt.p.z); scale.setScalar(.32);
      mesh.setMatrixAt(n++, m.compose(at, q, scale));
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  }, -24);
  return <primitive object={mesh} dispose={null} />;
}
