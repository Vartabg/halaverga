import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { FRAME_GROUPS } from '@/game/combat';
import { makeCity } from './cityData';
import { useCityMaterials } from './cityMaterials';
import Reclamation from './Reclamation';
import Village from './Village';
import VillageHouses from './villageHouses';
import Villager from './Villager';
import MassifTerrain from './MassifTerrain';
export default function HermonCity() {
  const city = useMemo(makeCity, []);
  const materials = useCityMaterials();
  useEffect(() => () => {
    city.geometry.dispose(); city.terrains.forEach(t => t.geometry.dispose()); materials.forEach(m => m.dispose());
  }, [city, materials]);
  return <>
    <RigidBody type="fixed" colliders={false}>
      <mesh name="sanctuary-props" geometry={city.geometry} material={materials} receiveShadow castShadow dispose={null} />
      <MassifTerrain chunks={city.terrains} />
      <Reclamation />
      <Village />
      <VillageHouses />
      <Villager />
      {city.solids.map((s, i) => s.kind === 'frame' ? null : <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} />)}
    </RigidBody>
    <RigidBody type="fixed" colliders={false} collisionGroups={FRAME_GROUPS}>
      {city.solids.map((s, i) => s.kind === 'frame' ? <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} /> : null)}
    </RigidBody>
  </>;
}
