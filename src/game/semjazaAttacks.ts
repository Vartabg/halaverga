/** Attack calculations, hitboxes, and ground runes for Semjaza. */
export interface DarkRune {
  x: number;
  y: number;
  z: number;
  radius: number;
  timer: number;
  erupted: boolean;
}

export interface ObsidianShard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
}

export const CLEAVE_RADIUS = 7.5;
export const CLEAVE_ANGLE = Math.PI * 0.65; // 117 degree sweep
export const RUNE_WARN_TIME = 1.2;
export const RUNE_DAMAGE_TIME = 0.5;

export function generateRunes(bossX: number, bossY: number, bossZ: number, playerX: number, playerZ: number): DarkRune[] {
  const runes: DarkRune[] = [];
  // 1 rune directly under the player's anticipated position
  runes.push({ x: playerX, y: bossY, z: playerZ, radius: 3.2, timer: 0, erupted: false });
  // 2 flanking runes
  const dx = playerX - bossX, dz = playerZ - bossZ;
  const perpX = -dz * 0.35, perpZ = dx * 0.35;
  runes.push({ x: playerX + perpX, y: bossY, z: playerZ + perpZ, radius: 2.8, timer: 0, erupted: false });
  runes.push({ x: playerX - perpX, y: bossY, z: playerZ - perpZ, radius: 2.8, timer: 0, erupted: false });
  return runes;
}

export function updateRunes(runes: DarkRune[], dt: number): void {
  for (const r of runes) {
    r.timer += dt;
    if (r.timer >= RUNE_WARN_TIME) r.erupted = true;
  }
}

export function checkCleaveHit(
  bossX: number, bossZ: number, bossYaw: number,
  playerX: number, playerZ: number, bossTimer: number
): boolean {
  if (bossTimer < 0.4 || bossTimer > 0.8) return false;
  const dx = playerX - bossX, dz = playerZ - bossZ;
  const dist = Math.hypot(dx, dz);
  if (dist > CLEAVE_RADIUS) return false;
  const angleToPlayer = Math.atan2(dx, dz);
  let diff = angleToPlayer - bossYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= CLEAVE_ANGLE * 0.5;
}

export function checkRuneHit(runes: DarkRune[], px: number, py: number, pz: number): boolean {
  for (const r of runes) {
    if (r.erupted && r.timer < RUNE_WARN_TIME + RUNE_DAMAGE_TIME) {
      const d = Math.hypot(px - r.x, pz - r.z);
      if (d <= r.radius && Math.abs(py - r.y) < 4.0) return true;
    }
  }
  return false;
}

export function spawnShards(bossX: number, bossY: number, bossZ: number, count = 6): ObsidianShard[] {
  const shards: ObsidianShard[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    shards.push({
      x: bossX + Math.cos(angle) * 3,
      y: bossY + 2,
      z: bossZ + Math.sin(angle) * 3,
      vx: Math.cos(angle) * 12,
      vy: -8,
      vz: Math.sin(angle) * 12,
      active: true,
    });
  }
  return shards;
}

export function updateShards(shards: ObsidianShard[], dt: number, groundY: number): void {
  for (const s of shards) {
    if (!s.active) continue;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y <= groundY) s.active = false;
  }
}
