/** Player Spear Combat state, combo chaining, dash i-frames, and damage resolution. */
export interface SpearCombatState {
  comboStep: number;
  comboTimer: number;
  dashTimer: number;
  isDashing: boolean;
  covenantWards: number;
  maxWards: number;
  invulnerableTimer: number;
  diveSmiteActive: boolean;
  attackLunge: number;
}

export const DASH_DURATION = 0.35; // 350ms of complete invulnerability
export const COMBO_WINDOW = 0.75;  // 750ms to chain next strike
export const MAX_WARDS = 3;

export function createSpearCombat(): SpearCombatState {
  return {
    comboStep: 0,
    comboTimer: 0,
    dashTimer: 0,
    isDashing: false,
    covenantWards: MAX_WARDS,
    maxWards: MAX_WARDS,
    invulnerableTimer: 0,
    diveSmiteActive: false,
    attackLunge: 0,
  };
}

export function triggerAttack(s: SpearCombatState): number {
  if (s.dashTimer > 0) return 0; // cannot attack mid-dash
  if (s.comboStep === 0 || s.comboTimer > COMBO_WINDOW) {
    s.comboStep = 1;
  } else {
    s.comboStep = (s.comboStep % 3) + 1;
  }
  s.comboTimer = 0;
  s.attackLunge = 2.5; // forward step on strike

  // Return base damage according to combo step
  // Step 1: Light sweep (45), Step 2: Thrust (65), Step 3: Overhead cleave (110)
  return s.comboStep === 3 ? 110 : s.comboStep === 2 ? 65 : 45;
}

export function triggerDash(s: SpearCombatState): boolean {
  if (s.dashTimer > 0) return false;
  s.dashTimer = DASH_DURATION;
  s.isDashing = true;
  s.invulnerableTimer = DASH_DURATION;
  return true;
}

export function triggerDiveSmite(s: SpearCombatState): number {
  s.diveSmiteActive = true;
  return 180; // Heavy dive smite damage
}

export function updateSpearCombat(s: SpearCombatState, dt: number): void {
  if (s.comboStep > 0) {
    s.comboTimer += dt;
    if (s.comboTimer > COMBO_WINDOW) s.comboStep = 0;
  }
  if (s.dashTimer > 0) {
    s.dashTimer -= dt;
    if (s.dashTimer <= 0) s.isDashing = false;
  }
  if (s.invulnerableTimer > 0) {
    s.invulnerableTimer -= dt;
  }
  if (s.attackLunge > 0) {
    s.attackLunge = Math.max(0, s.attackLunge - dt * 10);
  }
}

export function takePlayerDamage(s: SpearCombatState, amount = 1): boolean {
  if (s.invulnerableTimer > 0 || s.isDashing) return false; // dodged via i-frames
  s.covenantWards = Math.max(0, s.covenantWards - amount);
  s.invulnerableTimer = 1.5; // 1.5s post-hit grace period
  return true;
}
