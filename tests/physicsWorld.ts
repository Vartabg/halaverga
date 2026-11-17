import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion } from 'three';
import { makeCity } from '@/world/cityData';
import { makeField } from '@/world/fieldData';
import type { Solid } from '@/world/kit';
import type { TerrainChunk } from '@/world/massifGeometry';
import { FRAME_GROUPS } from '@/game/combat';

export type PhysicsGeometry = { solids: Solid[]; terrains: TerrainChunk[] };
let nearCache: PhysicsGeometry | null = null, outerCache: PhysicsGeometry | null = null;

/** Node fixtures mount the same triangle arrays as the production R3F colliders. */
export function physicsGeometry(includeOuter = true): PhysicsGeometry {
  if (includeOuter && outerCache) return outerCache;
  if (!includeOuter && nearCache) return nearCache;
  const city = makeCity();
  const field = includeOuter ? makeField() : null;
  const geometry = {
    solids: [...city.solids, ...(field?.solids ?? [])],
    terrains: [...city.terrains, ...(field?.terrains ?? [])],
  };
  city.geometry.dispose(); city.terrains.forEach(t => t.geometry.dispose());
  field?.geometries.forEach(g => g.dispose());
  if (includeOuter) outerCache = geometry; else nearCache = geometry;
  return geometry;
}

export function mountPhysicsGeometry(world: RAPIER.World, geometry: PhysicsGeometry) {
  for (const s of geometry.solids) {
    const rotation = new Quaternion().setFromEuler(new Euler(...s.rotation));
    const desc = RAPIER.ColliderDesc.cuboid(...s.size).setTranslation(...s.position).setRotation(rotation);
    if (s.kind === 'frame') desc.setCollisionGroups(FRAME_GROUPS);
    world.createCollider(desc);
  }
  for (const chunk of geometry.terrains) {
    world.createCollider(RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices));
  }
}
