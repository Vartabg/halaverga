import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { makeSanctuary } from './sanctuaryData';
import { sanctuaryMaterials, stepStoneLight } from './sanctuaryStone';
import { battle } from '@/game/celestialBattle';
import { useGame } from '@/game/store';

export default function Sanctuary() {
  const world = useMemo(makeSanctuary, []);
  const materials = useMemo(() => [...sanctuaryMaterials()], []);
  useEffect(() => () => { world.geometry.dispose(); materials.forEach(m => m.dispose()); }, [world, materials]);
  useFrame(({ invalidate }, dt) => { if (!useGame.getState().paused && stepStoneLight(battle.status === 'victory', dt)) invalidate(); });
  return <RigidBody type="fixed" colliders={false}>
    <mesh geometry={world.geometry} material={materials} castShadow receiveShadow dispose={null} />
    <TrimeshCollider args={[world.vertices, world.indices]} />
  </RigidBody>;
}
