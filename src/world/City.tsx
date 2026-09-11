import { useEffect, useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { DataTexture, RedFormat, NearestFilter } from 'three';
import { makeCity } from './cityData';
export default function City() {
  const city = useMemo(makeCity, []);
  const gradient = useMemo(() => {
    const texture = new DataTexture(new Uint8Array([100, 175, 245]), 3, 1, RedFormat);
    texture.minFilter = texture.magFilter = NearestFilter; texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => { city.geometry.dispose(); gradient.dispose(); }, [city, gradient]);
  return <RigidBody type="fixed" colliders={false}>
    <mesh geometry={city.geometry} receiveShadow castShadow>
      <meshToonMaterial vertexColors gradientMap={gradient} />
    </mesh>
    {city.solids.map((s, i) => <CuboidCollider key={i} args={s.size} position={s.position} rotation={s.rotation} />)}
  </RigidBody>;
}
