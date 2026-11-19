import { useEffect, useMemo } from 'react';
import { TrimeshCollider } from '@react-three/rapier';
import { naturalTerrainMaterial } from './naturalTerrain';
import type { TerrainChunk } from './massifGeometry';

/** Textured limestone and snow with the same fixed triangles used for flight collisions. */
export default function MassifTerrain({ chunks, shadows = true }: { chunks: TerrainChunk[]; shadows?: boolean }) {
  const material = useMemo(naturalTerrainMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  return <>
    {chunks.map(chunk => <mesh key={chunk.id} name={chunk.id} geometry={chunk.geometry} material={material}
      castShadow={shadows} receiveShadow={shadows} dispose={null} />)}
    {chunks.map(chunk => <TrimeshCollider key={chunk.id} args={[chunk.vertices, chunk.indices]} />)}
  </>;
}
