import { useEffect, useMemo } from 'react';
import { TrimeshCollider } from '@react-three/rapier';
import { paintInkMaterial } from './paintInk';
import { sharedTerrain } from './terrainArt';
import type { TerrainChunk } from './massifGeometry';

/** Static visible facets and their identical fixed collision triangles. Rock and snow come from the shared terrain art (TerrainLayer in
 * Scene); the plain paint shows until it arrives and stays if a file is missing. */
export default function MassifTerrain({ chunks, shadows = true }: { chunks: TerrainChunk[]; shadows?: boolean }) {
  const material = useMemo(() => paintInkMaterial(sharedTerrain, true), []);
  useEffect(() => () => material.dispose(), [material]);
  return <>
    {chunks.map(chunk => <mesh key={chunk.id} name={chunk.id} geometry={chunk.geometry} material={material}
      castShadow={shadows} receiveShadow={shadows} dispose={null} />)}
    {chunks.map(chunk => <TrimeshCollider key={chunk.id} args={[chunk.vertices, chunk.indices]} />)}
  </>;
}
