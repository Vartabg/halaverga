import type { Collider, World } from '@dimforge/rapier3d-compat';
import { FOOT, START, validCheckpoint, type Vec } from './motion';
import { CLEARANCE, limitApproach } from './navigation';
import { LOOK_S } from './limitCue';
/** Rapier interaction groups that see the city's solids but not the invisible district walls (combat.BOUNDARY_GROUPS is 0x0002ffff).
 *  The walls are limited exactly, by plane, in navigation.softenBounds: sweeping them gave a distance that wobbled at shallow angles. */
const SOLIDS_ONLY = 0x0001fffd;
const identity = { x: 0, y: 0, z: 0, w: 1 }, down = { x: 0, y: -1, z: 0 };
const supportOffsets = [[0, 0], [-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]];
export class FlightSafety {
  private flightProbe;
  private insideProbe;
  constructor(private world: World, private api: Pick<typeof import('@dimforge/rapier3d-compat'), 'Ball' | 'Capsule' | 'Ray'>, private body: Collider) {
    this.flightProbe = new api.Ball(1.05);
    this.insideProbe = new api.Capsule(.56, .37);
  }
  isClear(position: Vec) {
    return !this.world.intersectionWithShape(position, identity, this.insideProbe, undefined, undefined, this.body);
  }
  canLand(target: Vec) {
    const p = { x: target.x, y: target.y + FOOT, z: target.z };
    if (!validCheckpoint(p) || !this.isClear(p)) return false;
    return supportOffsets.every(([x, z]) => {
      const ray = new this.api.Ray({ x: p.x + x, y: p.y, z: p.z + z }, down);
      const hit = this.world.castRayAndGetNormal(ray, FOOT + .2, true, undefined, undefined, this.body);
      return hit && hit.normal.y > .85 && Math.abs(hit.timeOfImpact - FOOT) < .16;
    });
  }
  checkpoint(saved: Vec) {
    return validCheckpoint(saved) && this.canLand({ ...saved, y: saved.y - FOOT }) ? saved : START;
  }
  pathClear(from: Vec, to: Vec) {
    const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const hit = this.world.castShape(from, identity, delta, this.body.shape, .015, 1, false, undefined, undefined, this.body);
    return !hit || hit.time_of_impact >= .995;
  }
  /** How far (m, up to 20) the suit's own capsule can travel horizontally along (x, z) before it touches anything: the way out of a wedge. */
  freeRun(position: Vec, x: number, z: number) {
    const hit = this.world.castShape(position, identity, { x, y: 0, z }, this.body.shape, .015, 20, false, undefined, undefined, this.body);
    return hit ? hit.time_of_impact : 20;
  }
  /**
   * The flight step's look-ahead sweep. `contact` is the hit that changed the velocity (the clearance assist); `ahead` is the first
   * sweep's nearest hit up to LOOK_S seconds out at this speed, changing nothing, so the cue can name a solid early (limits plan S3).
   */
  anticipate(position: Vec, velocity: Vec) {
    let result = velocity, contact = null, ahead: { time: number; incidence: number } | null = null, last: Vec | null = null;
    // A second sweep checks the slide selected by the first, including inside corners.
    for (let pass = 0; pass < 2; pass++) {
      const speed = Math.hypot(result.x, result.y, result.z); if (speed < .05) break;
      const direction = { x: result.x / speed, y: result.y / speed, z: result.z / speed };
      const horizon = 1.5 + speed * CLEARANCE.lookAhead + speed * speed / (2 * CLEARANCE.brake);
      const hit = this.world.castShape(position, identity, direction, this.flightProbe, .08, pass === 0 ? Math.max(horizon, speed * LOOK_S) : horizon, false, undefined, SOLIDS_ONLY, this.body);
      if (!hit) break;
      const incidence = Math.max(0, -(direction.x * hit.normal1.x + direction.y * hit.normal1.y + direction.z * hit.normal1.z));
      if (pass === 0) ahead = { time: hit.time_of_impact / speed, incidence };
      if (hit.time_of_impact > horizon) break;
      // The slide the first sweep chose is checked against OTHER surfaces only: limiting the same face twice compounds the sweep's
      // small distance error into a jump in the last metre of a stop.
      if (last && last.x * hit.normal1.x + last.y * hit.normal1.y + last.z * hit.normal1.z > .98) break;
      const adjusted = limitApproach(result, hit.normal1, hit.time_of_impact * incidence);
      if (Math.hypot(adjusted.x - result.x, adjusted.y - result.y, adjusted.z - result.z) < .01) break;
      result = adjusted; contact = hit; last = hit.normal1;
    }
    return { velocity: result, contact, ahead };
  }
}
