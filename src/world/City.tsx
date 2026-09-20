import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { makeCity } from './cityData';
import { useCityMaterials } from './cityMaterials';
import Reclamation from './Reclamation';
export default function City() {
  const city = useMemo(makeCity, []);
  const materials = useCityMaterials();
  useEffect(() => () => { city.geometry.dispose(); materials.forEach(m => m.dispose()); }, [city, materials]);
  return <RigidBody type="fixed" colliders={false}>
    <mesh geometry={city.geometry} material={materials} receiveShadow castShadow dispose={null} />
    <Reclamation />
    {city.solids.map((s, i) => <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} />)}
  </RigidBody>;
}
