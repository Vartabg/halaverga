import { useEffect, useMemo } from 'react';
import { paintInkMaterial } from './paintInk';
import { sharedTerrain } from './terrainArt';
import { makeEdgeRing } from './edgeRingData';

/** The land past the world edge, falling away into the water and the haze. One static mesh, no collider, no shadow. */
export default function EdgeRing() {
  const ring = useMemo(() => makeEdgeRing(), []), material = useMemo(() => paintInkMaterial(sharedTerrain, true), []);
  useEffect(() => () => { ring.geometry.dispose(); material.dispose(); }, [ring, material]);
  return <mesh name="edge-ring" geometry={ring.geometry} material={material} frustumCulled={false} castShadow={false} receiveShadow={false} dispose={null} />;
}
