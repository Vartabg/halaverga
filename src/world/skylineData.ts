import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from '@/game/motion';
import { SKYLINE } from './atmospherePalette';
import { makeMassifChunk } from './massifGeometry';
import { MASSIF, type Bounds } from './massifData';

const expand = (gap: [number, number, number]): Bounds => ({
  minX: WORLD.minX - gap[1], maxX: WORLD.maxX + gap[1],
  minZ: WORLD.minZ - gap[0], maxZ: WORLD.maxZ + gap[2],
});
function ring(id: string, inner: Bounds, outer: Bounds, seed: number) {
  const strips: Bounds[] = [
    { minX: outer.minX, maxX: outer.maxX, minZ: outer.minZ, maxZ: inner.minZ },
    { minX: outer.minX, maxX: outer.maxX, minZ: inner.maxZ, maxZ: outer.maxZ },
    { minX: outer.minX, maxX: inner.minX, minZ: inner.minZ, maxZ: inner.maxZ },
    { minX: inner.maxX, maxX: outer.maxX, minZ: inner.minZ, maxZ: inner.maxZ },
  ];
  return strips.map((bounds, i) => makeMassifChunk(`${id}-${i}`, bounds, 10, seed));
}

export function makeSkylineChunks(seed: number = MASSIF.seed) {
  return SKYLINE.gaps.flatMap((gap, layer) => {
    const inner = layer === 0 ? WORLD : expand(SKYLINE.gaps[layer - 1]);
    return ring(`hermon-range-${layer}`, inner, expand(gap), seed);
  });
}

/** Continuous neighbouring alpine ranges in three dawn-haze layers, with no tower records or box parts. */
export function makeSkyline(seed: number = MASSIF.seed) {
  const chunks = makeSkylineChunks(seed);
  const geometry = mergeGeometries(chunks.map(c => c.geometry), false);
  if (!geometry) throw new Error('Hermon range geometry could not be merged');
  geometry.computeBoundingSphere();
  const triangles = chunks.reduce((sum, c) => sum + c.triangles, 0);
  chunks.forEach(c => c.geometry.dispose());
  return { geometry, triangles };
}
