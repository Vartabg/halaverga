import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { acquireTerrainArt } from './terrainArt';

/** Loads the shared rock and snow maps for the scene's ink-painted stone, without blocking it, and frees them with the scene. */
export default function TerrainLayer() {
  const { invalidate } = useThree();
  useEffect(() => acquireTerrainArt(invalidate), [invalidate]);
  return null;
}
