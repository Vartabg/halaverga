// Touch auto-fire (pure, landing-safe): while the player steers by touch and a centred shot would connect, the trigger is held with
// source 'touch' and input.auto = true, so the weapon's own automatic rate does the rest. An auto-fire hold never slows flight or adds
// aim-assist friction (combat.ts moveMode/engaged), but drones still perceive it (combat.ts threat). Plain numbers only: no
// three/React Three/Rapier imports and no allocation after module load. See docs/simple-controls.md.
import { pressFire, releaseFire, type ShooterState } from './combat';

/** Seconds: the crosshair must rest on a target for `dwell` before the press; the hold survives `grace` of lost acquisition. */
export const AUTO_FIRE = { dwell: .1, grace: .15 } as const;
/** dwell: time acquired before the press; lost: time unacquired while holding; holding: auto-fire owns the current trigger hold. */
export type AutoFire = { dwell: number; lost: number; holding: boolean };
export const createAutoFire = (): AutoFire => ({ dwell: 0, lost: 0, holding: false });
/** Module singleton (like burst.ts `burst`): the one auto-fire state for runtime.shooter. */
export const autoFire: AutoFire = createAutoFire();
const EPS = 1e-9;

/**
 * A centred shot would connect now: camera ray published, acquired (magnet cone of a live drone with LOS, or its body), the real
 * muzzle not blocked short of the crosshair (a.blocked: the last shot's result, or the HUD's muzzle ray while the arm is up), and
 * the weapon not locked. Camera LOS alone is not enough in third person: a railing between the cannon and the drone eats every shot.
 */
export const autoFireTarget = (s: ShooterState) => s.aim.valid && s.aim.acquired && !s.aim.blocked && s.weapon.lock === 0;

const clear = (af: AutoFire) => { af.holding = false; af.dwell = 0; af.lost = 0; };

/**
 * One frame of auto-fire, before the weapon advances. Reads last frame's s.aim.acquired (advanceAssist runs at the end of stepShooter).
 * Presses once per engagement, never during an overheat lock, and never presses or releases a hold another source owns.
 */
export function stepAutoFire(s: ShooterState, af: AutoFire, enabled: boolean, dt: number): void {
  const i = s.input, owns = i.fireSource === 'touch' && i.auto;
  // Reset or stolen (pause, blur, rotation, C, tap Fire, the Fire button): forget the hold without touching the trigger.
  if (af.holding && !owns) clear(af);
  const live = enabled && i.lookSource === 'touch' && (i.fireSource === 'none' || af.holding);
  if (!live || s.weapon.lock > 0) { if (af.holding) releaseFire(s, 'touch'); clear(af); return; }
  if (autoFireTarget(s)) {
    af.lost = 0;
    if (!af.holding) {
      af.dwell += dt;
      if (af.dwell >= AUTO_FIRE.dwell - EPS) { pressFire(s, 'touch'); i.auto = true; af.holding = true; af.dwell = 0; }
    }
  } else {
    af.dwell = 0;
    if (af.holding) {
      af.lost += dt;
      // The grace absorbs crosshair jitter; a blocked muzzle is not jitter, so it releases at once (one blocked shot, not a burst).
      if (s.aim.blocked || af.lost >= AUTO_FIRE.grace - EPS) { releaseFire(s, 'touch'); af.holding = false; af.lost = 0; }
    }
  }
}

/** Drops auto-fire's own hold (pause, unmount) and zeroes its timers. A manual or other-source hold is never released. */
export function resetAutoFire(s: ShooterState, af: AutoFire): void {
  if (af.holding && s.input.fireSource === 'touch' && s.input.auto) releaseFire(s, 'touch');
  clear(af);
}
