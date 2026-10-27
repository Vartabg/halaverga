/** Boss state machine for Semjaza, Chief of the Two Hundred (1 Enoch 6). */
export type SemjazaState = 'intro' | 'stride' | 'cleave' | 'glyphs' | 'stagger' | 'ascension' | 'barrage' | 'meteor' | 'defeated';

export interface SemjazaBoss {
  phase: 1 | 2;
  state: SemjazaState;
  hp: number;
  maxHp: number;
  stagger: number;
  maxStagger: number;
  staggerDecayTimer: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  timer: number;
  staggerTimer: number;
  targetX: number;
  targetZ: number;
  bannerVisible: boolean;
  introDone: boolean;
}

export const ARENA_CENTER = { x: 30, y: 38, z: -38 };
export const ARENA_RADIUS = 110;
export const MAX_HP = 1000;
export const MAX_STAGGER = 100;

export function createSemjaza(): SemjazaBoss {
  return {
    phase: 1,
    state: 'intro',
    hp: MAX_HP,
    maxHp: MAX_HP,
    stagger: 0,
    maxStagger: MAX_STAGGER,
    staggerDecayTimer: 0,
    x: ARENA_CENTER.x,
    y: ARENA_CENTER.y,
    z: ARENA_CENTER.z,
    yaw: 0,
    timer: 0,
    staggerTimer: 0,
    targetX: 0,
    targetZ: 0,
    bannerVisible: true,
    introDone: false,
  };
}

export function updateSemjaza(b: SemjazaBoss, dt: number, playerX: number, playerY: number, playerZ: number): void {
  b.timer += dt;
  if (b.state === 'intro') {
    if (b.timer > 3.2) {
      b.state = 'stride';
      b.timer = 0;
      b.bannerVisible = false;
      b.introDone = true;
    }
    return;
  }
  if (b.state === 'defeated') return;

  // Face player
  const dx = playerX - b.x, dz = playerZ - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.001) b.yaw = Math.atan2(dx, dz);

  // Check phase transition
  if (b.phase === 1 && b.hp <= MAX_HP * 0.5) {
    b.phase = 2;
    b.state = 'ascension';
    b.timer = 0;
    return;
  }

  if (b.state === 'stagger') {
    b.staggerTimer -= dt;
    if (b.staggerTimer <= 0) {
      b.stagger = 0;
      b.state = b.phase === 2 ? 'barrage' : 'stride';
      b.timer = 0;
    }
    return;
  }

  // Stagger decay if player stops attacking for > 4.0s
  b.staggerDecayTimer += dt;
  if (b.staggerDecayTimer > 4.0 && b.stagger > 0) {
    b.stagger = Math.max(0, b.stagger - dt * 25);
  }

  // Phase 1 Logic
  if (b.phase === 1) {
    if (b.state === 'stride') {
      if (dist > 7) {
        const speed = 4.5 * dt;
        b.x += (dx / dist) * speed;
        b.z += (dz / dist) * speed;
      }
      if (dist <= 7.5 && b.timer > 1.2) {
        b.state = 'cleave';
        b.timer = 0;
      } else if (dist > 14 && b.timer > 2.8) {
        b.state = 'glyphs';
        b.timer = 0;
      }
    } else if (b.state === 'cleave') {
      if (b.timer > 1.4) {
        b.state = 'stride';
        b.timer = 0;
      }
    } else if (b.state === 'glyphs') {
      if (b.timer > 2.2) {
        b.state = 'stride';
        b.timer = 0;
      }
    }
  } else {
    // Phase 2 Logic (Aerial Flight)
    if (b.state === 'ascension') {
      b.y = Math.min(ARENA_CENTER.y + 18, b.y + dt * 10);
      if (b.timer > 2.0) {
        b.state = 'barrage';
        b.timer = 0;
      }
    } else if (b.state === 'barrage') {
      if (b.timer > 4.5) {
        b.state = 'meteor';
        b.timer = 0;
        b.targetX = playerX;
        b.targetZ = playerZ;
      }
    } else if (b.state === 'meteor') {
      const mx = b.targetX - b.x, mz = b.targetZ - b.z;
      const mDist = Math.hypot(mx, mz);
      const chargeSpeed = 22 * dt;
      if (mDist > 1) {
        b.x += (mx / mDist) * chargeSpeed;
        b.z += (mz / mDist) * chargeSpeed;
      }
      b.y = Math.max(ARENA_CENTER.y, b.y - dt * 14);
      if (b.timer > 1.8 || b.y <= ARENA_CENTER.y + 0.5) {
        b.y = ARENA_CENTER.y;
        b.state = 'stagger';
        b.staggerTimer = 2.4;
        b.timer = 0;
      }
    }
  }

  // Arena leash constraint
  const cdx = b.x - ARENA_CENTER.x, cdz = b.z - ARENA_CENTER.z;
  const cDist = Math.hypot(cdx, cdz);
  if (cDist > ARENA_RADIUS) {
    b.x = ARENA_CENTER.x + (cdx / cDist) * ARENA_RADIUS;
    b.z = ARENA_CENTER.z + (cdz / cDist) * ARENA_RADIUS;
  }
}

export function applyStagger(b: SemjazaBoss, amount: number): boolean {
  if (b.state === 'intro' || b.state === 'defeated' || b.state === 'stagger') return false;
  b.staggerDecayTimer = 0;
  b.stagger = Math.min(MAX_STAGGER, b.stagger + amount);
  if (b.stagger >= MAX_STAGGER) {
    b.state = 'stagger';
    b.staggerTimer = 2.5; // 2.5s kneeling posture-broken window
    b.timer = 0;
    return true; // Posture broken
  }
  return false;
}

export function damageSemjaza(b: SemjazaBoss, amount: number): boolean {
  if (b.state === 'intro' || b.state === 'defeated') return false;
  b.staggerDecayTimer = 0;
  const mult = b.state === 'stagger' ? 1.5 : 1.0;
  b.hp = Math.max(0, b.hp - amount * mult);
  if (b.hp <= 0) {
    b.state = 'defeated';
    b.timer = 0;
    return true;
  }
  return false;
}
