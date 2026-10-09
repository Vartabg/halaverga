// Twin-stick flight helpers for Player (3D chunk only: the value import of three is fine because only Player imports this module).
// Level flight keeps the stick horizontal on touch, and a held Descend lands on whatever landable surface comes within reach below.
import { Vector3 } from 'three';
import type { Collider, World } from '@dimforge/rapier3d-compat';
import { FOOT, type Vec } from './motion';
import { runtime } from './runtime';
import { useGame } from './store';
import { touchMode } from './pointerMode';
/** Metres below the feet in which a held Descend starts the landing (at 9.1 m/s a physics step moves 0.15 m, so it cannot be skipped). */
export const LAND_WINDOW = 2.5;
type RayApi = Pick<typeof import('@dimforge/rapier3d-compat'), 'Ray'>;
type Ray = InstanceType<RayApi['Ray']>;
type Safe = { canLand(target: Vec): boolean };
type SafePath = Safe & { pathClear(from: Vec, to: Vec): boolean };

/**
 * Twin touch flies level (view pitch ignored) unless the player chose "Fly where I look". Desktop and classic keep pitch coupling,
 * and so does every Gesture Lab scheme (a drawn dive or a Brush soar pitches the flight).
 */
export function levelFlight(state: { touchScheme: string; flyWhereILook: boolean; controlLab?: string }): boolean {
  return state.touchScheme === 'twin' && !state.flyWhereILook && (state.controlLab ?? 'standard') === 'standard' && touchMode();
}

const down = { x: 0, y: -1, z: 0 }, hitPoint = new Vector3();
let ray: Ray | null = null, rayApi: RayApi | null = null;
/**
 * Casts straight down from `from` for `length` m, excluding the suit. Returns the surface point (a reused Vector3: copy it to keep it)
 * when the surface is flat enough (normal.y > .75) and FlightSafety allows a landing there; otherwise null.
 */
export function probeBelow(world: World, rapier: RayApi, collider: Collider, safe: Safe, from: Vec, length: number): Vector3 | null {
  if (!ray || rayApi !== rapier) { ray = new rapier.Ray({ x: from.x, y: from.y, z: from.z }, down); rayApi = rapier; }
  else { ray.origin.x = from.x; ray.origin.y = from.y; ray.origin.z = from.z; ray.dir = down; }
  const hit = world.castRayAndGetNormal(ray, length, true, undefined, undefined, collider);
  if (!hit || !(hit.normal.y > .75)) return null;
  hitPoint.set(from.x, from.y - hit.timeOfImpact, from.z);
  return safe.canLand(hitPoint) ? hitPoint : null;
}

export type TouchLandContext = { world: World; rapier: RayApi; collider: Collider; safe: Safe; position: Vec; flying: boolean };
/**
 * One physics step of hold-Descend-to-land. Releasing Descend re-arms it. While flying with Descend held (once per hold, and not
 * during another approach) a landable surface within LAND_WINDOW below starts the landing: landGoal is set, and descendUsed makes
 * readIntent drop Descend's sink so moving() does not cancel the approach. Returns true when it started one (Player resets its stall timer).
 */
export function touchLandStep(ctx: TouchLandContext): boolean {
  const st = runtime.stick;
  if (!st.descend) { st.descendUsed = false; return false; }
  if (!ctx.flying || st.descendUsed || runtime.landGoal) return false;
  const hit = probeBelow(ctx.world, ctx.rapier, ctx.collider, ctx.safe, ctx.position, FOOT + LAND_WINDOW);
  if (!hit) return false;
  runtime.landGoal = new Vector3(hit.x, hit.y + FOOT, hit.z);
  st.descendUsed = true;
  useGame.setState({ landing: true });
  return true;
}

/** Blocked descent: seconds the clearance assist must hold a Descend still before the nearby search, and the search pattern. */
export const BLOCKED = { hold: .4, rings: [2.5, 4, 5.5], dirs: 8, depth: 14, vy: 1, moved: 3 } as const;
const blocked = { time: 0, searched: null as Vec | null };
/**
 * The nearest landable spot around `from`: rings of 2.5, 4 and 5.5 m, 8 directions each, each cast straight down up to 14 m,
 * kept only when the suit can move there in a straight line. Returns the landing goal (feet on the surface) or null.
 */
export function findLandingNear(world: World, rapier: RayApi, collider: Collider, safe: SafePath, from: Vec): Vector3 | null {
  for (const r of BLOCKED.rings) for (let i = 0; i < BLOCKED.dirs; i++) {
    const a = i / BLOCKED.dirs * Math.PI * 2, p = { x: from.x + Math.cos(a) * r, y: from.y, z: from.z + Math.sin(a) * r };
    const hit = probeBelow(world, rapier, collider, safe, p, BLOCKED.depth);
    if (!hit) continue;
    const goal = new Vector3(hit.x, hit.y + FOOT, hit.z);
    if (safe.pathClear(from, goal)) return goal;
  }
  return null;
}
export type BlockedContext = Omit<TouchLandContext, 'safe'> & { safe: SafePath; clearance: boolean; vy: number; dt: number };
/**
 * One physics step of a held Descend that the clearance assist has stopped (tree canopy, a sloped roof or a railing below):
 * after 0.4 s of no descent it looks for a landable spot within 5.5 m and lands there; with none, Descend shows "No landing"
 * (store.descendBlocked) until it is released, the descent resumes, or the suit moves 3 m and a new search finds one.
 */
export function touchBlockedStep(ctx: BlockedContext): boolean {
  const st = runtime.stick, g = useGame.getState();
  const stalled = ctx.flying && !!st.descend && !st.descendUsed && !runtime.landGoal && ctx.clearance && Math.abs(ctx.vy) < BLOCKED.vy;
  if (!stalled) {
    blocked.time = 0;
    if (!st.descend) blocked.searched = null;
    if (g.descendBlocked && !(ctx.flying && st.descend && ctx.clearance)) useGame.setState({ descendBlocked: false });
    return false;
  }
  blocked.time += ctx.dt;
  const last = blocked.searched, p = ctx.position;
  if (blocked.time < BLOCKED.hold || (last && Math.hypot(p.x - last.x, p.z - last.z) < BLOCKED.moved)) return false;
  blocked.searched = { x: p.x, y: p.y, z: p.z };
  const goal = findLandingNear(ctx.world, ctx.rapier, ctx.collider, ctx.safe, p);
  if (!goal) { if (!g.descendBlocked) useGame.setState({ descendBlocked: true }); return false; }
  runtime.landGoal = goal; st.descendUsed = true;
  useGame.setState({ landing: true, descendBlocked: false });
  return true;
}
