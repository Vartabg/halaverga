import { OUTER_BOUNDS, MASSIF } from './massifData';
import { makeMassifChunk, type TerrainChunk } from './massifGeometry';
import type { Solid } from './kit';

export const FIELD = { seed: MASSIF.seed } as const;

/** Four abutting outer ranges; no street walk, block placements, box ruins or approximated cuboids. */
export function makeField(seed: number = FIELD.seed) {
  const terrains: TerrainChunk[] = Object.entries(OUTER_BOUNDS).map(([id, bounds]) =>
    makeMassifChunk(id, bounds, MASSIF.step, seed));
  return {
    terrains,
    geometries: terrains.map(t => t.geometry),
    solids: [] as Solid[],
    triangles: terrains.reduce((sum, t) => sum + t.triangles, 0),
  };
}
