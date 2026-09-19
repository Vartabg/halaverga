export type Vec = { x: number; y: number; z: number };
export type Intent = { forward: number; strafe: number; vertical: number; precise?: true };
export const FOOT = 1.06;
export const START: Vec = { x: 0, y: 20 + FOOT, z: 65 };
export const WORLD = { minX: -205, maxX: 205, minZ: -188, maxZ: 108, ceiling: 105 };
export const SPEED = { walk: 5, flight: 13, surge: 34 };
export const moving = (i: Intent) => Math.hypot(i.forward, i.strafe, i.vertical) > (i.precise ? 1e-6 : .08);
export const safeDelta = (dt: number) => Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 1 / 30) : 0;
export const setVec = (v: Vec, x: number, y: number, z: number) => { v.x = x; v.y = y; v.z = z; };

export function advanceVelocity(v: Vec, i: Intent, yaw: number, pitch: number,
  flying: boolean, surge: boolean, elapsed: number): Vec {
  const dt = safeDelta(elapsed);
  const active = moving(i);
  const speed = flying ? (surge && active ? SPEED.surge : SPEED.flight) : SPEED.walk;
  const cp = flying ? Math.cos(pitch) : 1;
  const direction = {
    x: -Math.sin(yaw) * cp * i.forward + Math.cos(yaw) * i.strafe,
    y: flying ? Math.sin(pitch) * i.forward + i.vertical : 0,
    z: -Math.cos(yaw) * cp * i.forward - Math.sin(yaw) * i.strafe,
  };
  const length = Math.max(1, Math.hypot(direction.x, direction.y, direction.z));
  const gain = 1 - Math.exp(-(active ? 4 : 9) * dt);
  const next = {
    x: v.x + (direction.x / length * speed - v.x) * gain,
    y: flying ? v.y + (direction.y / length * speed - v.y) * gain : Math.max(-20, v.y - 22 * dt),
    z: v.z + (direction.z / length * speed - v.z) * gain,
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
  return next;
}

export function boundMovement(position: Vec, movement: Vec, flying: boolean): Vec {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    x: clamp(position.x + movement.x, WORLD.minX, WORLD.maxX) - position.x,
    y: clamp(position.y + movement.y, flying ? 1.7 : -20, WORLD.ceiling) - position.y,
    z: clamp(position.z + movement.z, WORLD.minZ, WORLD.maxZ) - position.z,
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
