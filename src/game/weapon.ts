// Weapon clock, heat, vent and spread (pure, landing-safe). The shooter orchestrator calls advanceWeapon once per render
// frame, never in the physics step (which runs 0..N times per frame and bursts after a hitch). No events or audio here.
import { HEAT, SNAP, type WeaponState } from './combat';

export const WEAPON = { rate: 9, heatPerShot: 4.5, coolDelay: .3, coolRate: 60, spreadMinDeg: .8, spreadMaxDeg: 4, spreadHeatMax: 10, spreadDelay: .15, spreadRecover: 12, firstShotRest: .25, adsSpreadMul: .4, moveRate: 5 } as const;
const PERIOD = 1 / WEAPON.rate, EPS = 1e-9, MAX_SHOTS = 3, DEG = Math.PI / 180;
const stepDt = (elapsed: number) => Number.isFinite(elapsed) ? Math.min(.05, Math.max(0, elapsed)) : 0;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const unit = (v: number) => v > 0 ? Math.min(1, v) : 0;

export const heat01 = (w: WeaponState) => w.heat / HEAT.max;
export const locked = (w: WeaponState) => w.lock > 0;
export const bloom01 = (w: WeaponState) => w.spreadHeat / WEAPON.spreadHeatMax;

/** One shot: returns true when it overheated the weapon (the caller stops firing this call). */
function fire(w: WeaponState, since: number) {
  w.shots++; w.heat += WEAPON.heatPerShot; w.spreadHeat = Math.min(WEAPON.spreadHeatMax, w.spreadHeat + 1);
  w.sinceShot = since; w.pending = false;
  if (w.heat < HEAT.max) return false;
  w.heat = HEAT.max; w.lock = HEAT.lock; w.lockT = 0; w.justOverheated = true; w.acc = 0;
  return true;
}

/** Advances the weapon by one render frame and returns the number of shots to resolve (0..3). */
export function advanceWeapon(w: WeaponState, fireHeld: boolean, pressSerial: number, elapsed: number): number {
  const dt = stepDt(elapsed);
  w.justOverheated = false; w.justVented = false; w.sinceShot += dt;
  let fresh = pressSerial !== w.handledPress, shots = 0;
  w.handledPress = pressSerial;
  if (w.lock > 0) {
    w.lockT += dt;
    w.heat = HEAT.max * Math.max(0, 1 - w.lockT / HEAT.lock);
    if (fresh && Math.abs(w.lockT - HEAT.ventAt) <= HEAT.ventHalf) {
      w.heat = 0; w.lock = 0; w.lockT = 0; w.acc = 0; w.justVented = true; w.pending = false;
    } else if (w.lockT >= HEAT.lock) { w.lock = 0; w.lockT = 0; w.heat = 0; w.acc = 0; }
    fresh = false;
    if (w.lock > 0) return 0;
  }
  if (fresh) w.pending = true;
  let stop = false;
  if (w.pending && w.sinceShot >= PERIOD - EPS) { shots++; stop = fire(w, 0); w.acc = 0; }
  if (fireHeld && !stop) {
    w.acc += dt;
    while (w.acc >= PERIOD - EPS && shots < MAX_SHOTS) {
      w.acc = Math.max(0, w.acc - PERIOD); shots++;
      if (fire(w, w.acc)) break;
    }
  } else if (!fireHeld) w.acc = 0;
  if (w.lock === 0) {
    if (w.sinceShot > WEAPON.coolDelay) w.heat = Math.max(0, w.heat - WEAPON.coolRate * dt);
    if (w.sinceShot > WEAPON.spreadDelay) w.spreadHeat = Math.max(0, w.spreadHeat - WEAPON.spreadRecover * dt);
  }
  return shots;
}

/** Movement spread multiplier target for a speed in m/s. */
export function moveTarget(speed: number) {
  const s = speed > 0 ? speed : 0;
  if (s <= 1.5) return .7;
  if (s < 3) return lerp(.7, 1, (s - 1.5) / 1.5);
  if (s <= 13) return 1;
  return lerp(1, 1.8, unit((s - 13) / 21));
}

/** Settles w.moveMul toward the speed target (exact exponential, rate WEAPON.moveRate, snaps within SNAP). */
export function advanceSpread(w: WeaponState, ads: number, speed: number, elapsed: number): void {
  void ads;
  const dt = stepDt(elapsed), target = moveTarget(speed);
  w.moveMul += (target - w.moveMul) * (1 - Math.exp(-WEAPON.moveRate * dt));
  if (Math.abs(target - w.moveMul) <= SNAP) w.moveMul = target;
}

/** Spread cone half-angle in radians (half the full-cone diameter); 0 for a rested, still, aimed first shot. */
export function spreadHalfAngle(w: WeaponState, ads: number, speed: number): number {
  const a = unit(ads);
  if (a > .9 && speed < 1.5 && w.sinceShot >= WEAPON.firstShotRest) return 0;
  const diameter = lerp(WEAPON.spreadMinDeg, WEAPON.spreadMaxDeg, bloom01(w)) * lerp(1, WEAPON.adsSpreadMul, a) * w.moveMul;
  return diameter / 2 * DEG;
}
