import { useEffect, useMemo } from 'react';
import { makeEdgeRing } from './edgeRingData';
import { naturalTerrainMaterial } from './naturalTerrain';

export default function EdgeRing() {
  const geometry = useMemo(() => makeEdgeRing(), []);
  const material = useMemo(naturalTerrainMaterial, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh name="edge-ring" geometry={geometry} material={material} castShadow={false} receiveShadow={false} dispose={null} />;
}
