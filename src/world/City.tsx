import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { FRAME_GROUPS } from '@/game/combat';
import { makeCity } from './cityData';
import { useCityMaterials } from './cityMaterials';
import Village from './Village';
export default function City() {
  const city = useMemo(makeCity, []);
  const materials = useCityMaterials();
  useEffect(() => () => { city.geometry.dispose(); materials.forEach(m => m.dispose()); }, [city, materials]);
  return <>
    <RigidBody type="fixed" colliders={false}>
      <mesh geometry={city.geometry} material={materials} receiveShadow castShadow dispose={null} />
      <Village />
      {city.solids.map((s, i) => s.kind === 'frame' ? null : <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} />)}
    </RigidBody>
    {/* Watcher monolith colonnades: solid to flight and shots, see-through to the camera boom (combat.FRAME_GROUPS). */}
    <RigidBody type="fixed" colliders={false} collisionGroups={FRAME_GROUPS}>
      {city.solids.map((s, i) => s.kind === 'frame' ? <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} /> : null)}
    </RigidBody>
  </>;
}
