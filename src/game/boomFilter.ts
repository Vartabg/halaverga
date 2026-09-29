import type { Collider } from '@dimforge/rapier3d-compat';
import { BOUNDARY_GROUPS } from './combat';
/**
 * Which colliders shorten the chase camera's boom: the city's fixed solids only. The six invisible district walls sit in
 * BOUNDARY_GROUPS; sweeping them cut the boom to about 1.2 m while the suit turned away from an edge, cramping the view exactly when
 * the pilot is turning back (limits plan S7). Camera only: flight still collides with them.
 */
export const boomBlocks = (col: Collider): boolean => (col.parent()?.isFixed() ?? true) && col.collisionGroups() !== BOUNDARY_GROUPS;
