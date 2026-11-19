import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { FRAME_GROUPS } from '@/game/combat';
import { setObstacles } from '@/game/obstacles';
import { makeNearMassif } from './nearMassifData';
import { paintInkMaterial } from './paintInk';
import { sharedTerrain } from './terrainArt';
import Cedars from './Cedars';
import Scree from './Scree';
import Village from './Village';
import MassifTerrain from './MassifTerrain';
export default function NearMassif() {
  const massif = useMemo(makeNearMassif, []);
  const material = useMemo(() => paintInkMaterial(sharedTerrain), []);
  useEffect(() => () => {
    massif.geometry.dispose(); massif.terrains.forEach(t => t.geometry.dispose()); material.dispose();
  }, [massif, material]);
  // What a thrown demon strikes: the megaliths this mesh draws, and the arch (a terrain chunk of the same massif).
  useEffect(() => { setObstacles(massif.stones, true); return () => setObstacles([], false); }, [massif]);
  return <>
    <RigidBody type="fixed" colliders={false}>
      <mesh name="sanctuary-props" geometry={massif.geometry} material={material} receiveShadow castShadow dispose={null} />
      <MassifTerrain chunks={massif.terrains} />
      <Cedars /><Scree />
      <Village />
      {massif.solids.map((s, i) => s.kind === 'frame' ? null : <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} />)}
    </RigidBody>
    <RigidBody type="fixed" colliders={false} collisionGroups={FRAME_GROUPS}>
      {massif.solids.map((s, i) => s.kind === 'frame' ? <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} /> : null)}
    </RigidBody>
  </>;
}
