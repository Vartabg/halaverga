// The Gesture Lab's host services for Player (3D chunk only: Player is its one importer). Built once per Player: the land request
// sets the landing goal the way the Land button does, and groundBelow re-casts at most every 0.15 s of lab clock, corrected by the
// height moved since the cast so a dive reads the ground it is falling toward.
import { Vector3 } from 'three';
import type { Collider, World } from '@dimforge/rapier3d-compat';
import { FOOT, type Vec } from './motion';
import { runtime } from './runtime';
import { useGame } from './store';
import type { GestureCtx } from './gesture/types';
import { gesture } from './gesture/bus';

type RayApi = Pick<typeof import('@dimforge/rapier3d-compat'), 'Ray'>;
type Safe = { canLand(target: Vec): boolean; pathClear(from: Vec, to: Vec): boolean };
/** Metres the ground ray reaches below the suit; farther counts as no ground (Infinity). */
export const GROUND_RANGE = 60;
/** Seconds of lab clock between ground casts. */
export const GROUND_EVERY = .15;

export type GestureHostRefs = { world: World; rapier: RayApi; collider(): Collider | null; safe(): Safe | null; landed(): void };
export function createGestureCtx(h: GestureHostRefs): GestureCtx {
  const down = { x: 0, y: -1, z: 0 }, cache = { t: -Infinity, y: 0, d: Infinity };
  let ray: InstanceType<RayApi['Ray']> | null = null;
  const ctx: GestureCtx = {
    clock: 0,
    canLand: pt => h.safe()?.canLand(pt) ?? false,
    pathClear: (a, b) => h.safe()?.pathClear(a, b) ?? false,
    groundBelow(p) {
      if (ctx.clock - cache.t >= GROUND_EVERY) {
        const col = h.collider();
        if (!ray) ray = new h.rapier.Ray({ x: p.x, y: p.y, z: p.z }, down);
        else { ray.origin.x = p.x; ray.origin.y = p.y; ray.origin.z = p.z; }
        const hit = col ? h.world.castRay(ray, GROUND_RANGE, true, undefined, undefined, col) : null;
        cache.t = ctx.clock; cache.y = p.y; cache.d = hit ? hit.timeOfImpact : Infinity;
      }
      return cache.d === Infinity ? Infinity : Math.max(0, cache.d - (cache.y - p.y));
    },
    // Standing, a landing would walk the hero to the target (landingVelocity on the grounded controller): refuse it.
    land(pt) {
      if (!useGame.getState().flying) { gesture.landArmed = false; return; }
      runtime.landGoal = new Vector3(pt.x, pt.y + FOOT, pt.z); h.landed();
      useGame.setState({ landing: true });
    },
    say: message => useGame.setState({ message }),
  };
  return ctx;
}
