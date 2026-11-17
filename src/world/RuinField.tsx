import { useEffect, useMemo } from 'react';
import { RigidBody } from '@react-three/rapier';
import { makeField } from './fieldData';
import MassifTerrain from './MassifTerrain';

/** Outer Hermon ranges: four static terrain meshes and four matching fixed trimeshes. */
export default function RuinField() {
  const field = useMemo(() => makeField(), []);
  useEffect(() => () => { field.geometries.forEach(g => g.dispose()); }, [field]);
  return <RigidBody type="fixed" colliders={false}>
    <MassifTerrain chunks={field.terrains} />
  </RigidBody>;
}
