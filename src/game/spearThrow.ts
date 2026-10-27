/** Ranged spear throw ballistics, ground/boss embedding, and magnetic recall. */
export interface SpearProjectile {
  active: boolean;
  embedded: boolean;
  recalling: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  timer: number;
}

export const THROW_SPEED = 48; // fast ballistic velocity
export const RECALL_SPEED = 54;
export const MAX_FLIGHT_DIST = 100;

export function createSpearProjectile(): SpearProjectile {
  return {
    active: false,
    embedded: false,
    recalling: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    timer: 0,
  };
}

export function launchSpear(
  p: SpearProjectile,
  originX: number, originY: number, originZ: number,
  dirX: number, dirY: number, dirZ: number
): void {
  p.active = true;
  p.embedded = false;
  p.recalling = false;
  p.x = originX;
  p.y = originY;
  p.z = originZ;
  p.vx = dirX * THROW_SPEED;
  p.vy = dirY * THROW_SPEED;
  p.vz = dirZ * THROW_SPEED;
  p.timer = 0;
}

export function recallSpear(p: SpearProjectile): void {
  if (p.active) {
    p.embedded = false;
    p.recalling = true;
  }
}

export function updateSpearProjectile(
  p: SpearProjectile,
  dt: number,
  playerX: number, playerY: number, playerZ: number,
  bossX: number, bossY: number, bossZ: number
): { hitBoss: boolean; returnedToHand: boolean } {
  let hitBoss = false;
  let returnedToHand = false;

  if (!p.active) return { hitBoss, returnedToHand };
  p.timer += dt;

  if (p.recalling) {
    const rx = playerX - p.x, ry = playerY - p.y, rz = playerZ - p.z;
    const dist = Math.hypot(rx, ry, rz);
    if (dist <= 2.0 || dist <= RECALL_SPEED * dt || p.timer > 5.0) {
      p.active = false;
      p.recalling = false;
      returnedToHand = true;
    } else {
      p.x += (rx / dist) * RECALL_SPEED * dt;
      p.y += (ry / dist) * RECALL_SPEED * dt;
      p.z += (rz / dist) * RECALL_SPEED * dt;
    }
  } else if (!p.embedded) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    // Check hit against boss (2.5m collision sphere)
    const bdx = p.x - bossX, bdy = p.y - bossY, bdz = p.z - bossZ;
    if (Math.hypot(bdx, bdy, bdz) < 2.5) {
      p.embedded = true;
      hitBoss = true;
    }

    // Auto-recall if exceeding max range
    const pdx = p.x - playerX, pdz = p.z - playerZ;
    if (Math.hypot(pdx, pdz) > MAX_FLIGHT_DIST) {
      recallSpear(p);
    }
  }

  return { hitBoss, returnedToHand };
}
