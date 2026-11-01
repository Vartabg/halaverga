export type Vec = { x: number; y: number; z: number };
export type Intent = { forward: number; strafe: number; vertical: number; precise?: true };
export const FOOT = 1.06;
export const START: Vec = { x: 0, y: 20 + FOOT, z: 65 };
/** The flyable Mount Hermon open world: connected near slopes, outer alpine ranges, and clear air above their highest crests. */
export const WORLD = { minX: -420, maxX: 420, minZ: -430, maxZ: 300, ceiling: 150 };
/** Where a flying suit's floor is (boundMovement clamps at it); the water is at y = 0.1. */
export const FLIGHT_FLOOR = 1.7;
export const SPEED = { walk: 5, flight: 13, surge: 34 };
export const combatMotion = { vx: 0, vy: 0, vz: 0, timer: 0 };
export const moving = (i: Intent) => Math.hypot(i.forward, i.strafe, i.vertical) > (i.precise ? 1e-6 : .08);
export const safeDelta = (dt: number) => Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 1 / 30) : 0;
export const setVec = (v: Vec, x: number, y: number, z: number) => { v.x = x; v.y = y; v.z = z; };

/** The velocity the controls ask for: heading x pitch x intent x speed (the target advanceVelocity eases toward). */
export function flightTarget(i: Intent, yaw: number, pitch: number, flying: boolean, surge: boolean): Vec {
  const speed = flying ? (surge && moving(i) ? SPEED.surge : SPEED.flight) : SPEED.walk;
  const cp = flying ? Math.cos(pitch) : 1;
  const direction = {
    x: -Math.sin(yaw) * cp * i.forward + Math.cos(yaw) * i.strafe,
    y: flying ? Math.sin(pitch) * i.forward + i.vertical : 0,
    z: -Math.cos(yaw) * cp * i.forward - Math.sin(yaw) * i.strafe,
  };
  const length = Math.max(1, Math.hypot(direction.x, direction.y, direction.z));
  return { x: direction.x / length * speed, y: direction.y / length * speed, z: direction.z / length * speed };
}

export function advanceVelocity(v: Vec, i: Intent, yaw: number, pitch: number,
  flying: boolean, surge: boolean, elapsed: number): Vec {
  const dt = safeDelta(elapsed);
  const active = moving(i);
  const target = flightTarget(i, yaw, pitch, flying, surge);
  const gain = 1 - Math.exp(-(active ? 4 : 9) * dt);
  const next = {
    x: v.x + (target.x - v.x) * gain,
    y: flying ? v.y + (target.y - v.y) * gain : Math.max(-20, v.y - 22 * dt),
    z: v.z + (target.z - v.z) * gain,
  };
  if (flying) {
    const change = Math.hypot(next.x - v.x, next.y - v.y, next.z - v.z);
    const maximum = (active ? 42 : 110) * dt;
    if (change > maximum) {
      const ratio = maximum / change;
      next.x = v.x + (next.x - v.x) * ratio;
      next.y = v.y + (next.y - v.y) * ratio;
      next.z = v.z + (next.z - v.z) * ratio;
    }
  }
  if (combatMotion.timer > 0) {
    combatMotion.timer = Math.max(0, combatMotion.timer - dt);
    next.x = combatMotion.vx;
    next.z = combatMotion.vz;
    if (combatMotion.vy !== 0) next.y = combatMotion.vy;
    if (combatMotion.timer <= 0) combatMotion.vy = 0;
  }
  return next;
}

/** Direct screen-space isometric velocity + controlled Wing Hover altitude (y = 24.8 m) for Mount Hermon Action Brawler. */
export function stepIsoShooterVelocity(v: Vec, i: Intent, pos: Vec, flying: boolean, surge: boolean, elapsed: number): Vec {
  const dt = safeDelta(elapsed);
  const len = Math.max(1, Math.hypot(i.strafe, i.forward));
  const active = Math.hypot(i.strafe, i.forward) > 0.08;
  const spd = flying ? (surge ? 13.5 : 10.2) : 9.2;
  const tx = active ? (i.strafe / len) * spd : 0;
  const tz = active ? (-i.forward / len) * spd : 0;
  const gain = 1 - Math.exp(-(active ? 14 : 18) * dt);
  let nx = v.x + (tx - v.x) * gain;
  let nz = v.z + (tz - v.z) * gain;
  if (!active && Math.hypot(nx, nz) < 0.08) { nx = 0; nz = 0; }
  const dy = 24.8 - pos.y;
  let ny = flying
    ? (Math.abs(dy) > 0.04 ? Math.max(-14, Math.min(14, dy * 11)) : 0)
    : Math.max(-22, v.y - 28 * dt);
  if (combatMotion.timer > 0) {
    combatMotion.timer = Math.max(0, combatMotion.timer - dt);
    nx = combatMotion.vx;
    nz = combatMotion.vz;
    if (combatMotion.vy !== 0) ny = combatMotion.vy;
    if (combatMotion.timer <= 0) combatMotion.vy = 0;
  }
  return { x: nx, y: ny, z: nz };
}

export function boundMovement(position: Vec, movement: Vec, flying: boolean, isoArena = false): Vec {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  let nx = clamp(position.x + movement.x, WORLD.minX, WORLD.maxX);
  let nz = clamp(position.z + movement.z, WORLD.minZ, WORLD.maxZ);
  if (isoArena) {
    const r = Math.hypot(nx, nz - 55);
    if (r > 18.6 && r < 32) {
      nx *= 18.6 / r;
      nz = 55 + (nz - 55) * (18.6 / r);
    }
  }
  return {
    x: nx - position.x,
    y: clamp(position.y + movement.y, flying ? FLIGHT_FLOOR : -20, WORLD.ceiling) - position.y,
    z: nz - position.z,
  };
}

export function landingVelocity(position: Vec, target: Vec): Vec {
  const difference = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
  const distance = Math.hypot(difference.x, difference.y, difference.z);
  const scale = distance > 0.001 ? Math.min(7, distance * 3) / distance : 0;
  return { x: difference.x * scale, y: difference.y * scale, z: difference.z * scale };
}

export function validCheckpoint(value: unknown): value is Vec {
  if (!value || typeof value !== 'object') return false;
  const v = value as Vec;
  return [v.x, v.y, v.z].every(Number.isFinite) && v.x >= WORLD.minX && v.x <= WORLD.maxX &&
    v.z >= WORLD.minZ && v.z <= WORLD.maxZ && v.y >= 2 && v.y <= WORLD.ceiling;
}
