import type { CharacterCollision, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { BOUNDARY_GROUPS } from './combat';
import { setVec, type Vec } from './motion';
/**
 * The city solid the character controller pressed on last step (limits plan S6). The clearance sweep only reports a hit on the steps
 * the limiter changed the velocity, and a scrape along a facade or hill flickers through that; the controller's own collision is
 * there every step of the slide. The six invisible district walls are left out (the wall nudge handles them by plane). Normal points
 * out of the solid, like the clearance normal. Player.tsx and tests/lim/harness.ts both call this after computeColliderMovement.
 */
export interface Scrape { active: boolean; normal: Vec }
/** The one live record (Player.tsx writes and reads it; kept out of runtime.ts, which the landing page loads). */
export const scrape: Scrape = { active: false, normal: { x: 0, y: 1, z: 0 } };
const hit: CharacterCollision = { collider: null, translationDeltaApplied: { x: 0, y: 0, z: 0 }, translationDeltaRemaining: { x: 0, y: 0, z: 0 }, toi: 0,
  witness1: { x: 0, y: 0, z: 0 }, witness2: { x: 0, y: 0, z: 0 }, normal1: { x: 0, y: 0, z: 0 }, normal2: { x: 0, y: 0, z: 0 } };
export function readScrape(c: KinematicCharacterController, out: Scrape): void {
  out.active = false;
  for (let i = 0; i < c.numComputedCollisions(); i++) {
    const h = c.computedCollision(i, hit);
    if (!h || !h.collider || h.collider.collisionGroups() === BOUNDARY_GROUPS) continue;
    setVec(out.normal, h.normal1.x, h.normal1.y, h.normal1.z); out.active = true; return;
  }
}
