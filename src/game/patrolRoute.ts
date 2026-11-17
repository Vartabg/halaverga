import type { Vec3 } from './combat';
import { PATROL_SITES, PATROLS, type PatrolSite } from './dronePatrols';

export function nextPatrolSite(position: Vec3, sealed: number) {
  let guidance: { site: PatrolSite; remaining: number } | undefined;
  let nearest = Infinity;
  for (const site of PATROL_SITES) {
    const { x, y, z } = site.approach;
    const distance = Math.hypot(x - position.x, y - position.y, z - position.z);
    if (distance >= nearest) continue;
    const remaining = PATROLS.reduce((count, patrol, i) => count + Number(patrol.site === site.id && !(sealed & (1 << i))), 0);
    if (remaining === 0) continue;
    guidance = { site, remaining };
    nearest = distance;
  }
  return guidance;
}

export function patrolDirection(site: PatrolSite, position: Vec3, yaw: number) {
  const { x, y, z } = site.approach;
  const dx = x - position.x, dz = z - position.z, dy = y - position.y;
  const horizontal = Math.hypot(dx, dz);
  if (site.id === 'sanctuary' && dy > 3) return `Climb to ${y} m`;
  if (horizontal < 30 && Math.abs(dy) < 18) return 'Patrol nearby';
  const angle = Math.atan2(-dx, -dz) - yaw;
  const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (horizontal > 8 && Math.abs(turn) > Math.PI / 6) return turn > 0 ? 'Turn left' : 'Turn right';
  if (dy < -18 && horizontal < 30) return 'Descend toward the patrol';
  if (dy > 12 && horizontal < 30) return 'Climb toward the patrol';
  return 'Fly ahead';
}
