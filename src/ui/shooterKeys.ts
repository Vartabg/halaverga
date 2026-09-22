import { pressAim, pressFire, releaseAim, releaseFire, type LookSource, type ShooterState } from '../game/combat';
// Pure Fire/Aim routing for keyboard and mouse. Presses are gated; releases are not, so a hold can always end.
export type ShooterEnv = { enabled: boolean; started: boolean; paused: boolean; aimToggle: boolean; desktopMode: 'trackpad' | 'mouse'; steering: string; locked: boolean };
export type ShooterKey = { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; targetTag: string };
const live = (env: ShooterEnv) => env.enabled && env.started && !env.paused;
/** A locked primary click fires in mouse mode and in the one-finger `simple` trackpad profile (plain string: PR #12 may add it). */
export const lockedClickFire = (env: ShooterEnv) => live(env) && env.locked
  && (env.desktopMode === 'mouse' || (env.desktopMode === 'trackpad' && env.steering === 'simple'));
/** Returns true when handled; the caller then calls preventDefault. A repeat is ignored, so a key held through a pause must be pressed again. */
export function keyDown(e: ShooterKey, env: ShooterEnv, s: ShooterState) {
  if (!live(env) || e.metaKey || e.ctrlKey || e.altKey || e.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(e.targetTag)) return false;
  if (e.code === 'KeyC') { pressFire(s, 'keys'); return true; }
  if (e.code === 'KeyQ') { pressAim(s, env.aimToggle); return true; }
  return false;
}
export function keyUp(code: string, env: ShooterEnv, s: ShooterState) {
  if (code === 'KeyC') releaseFire(s, 'keys');
  else if (code === 'KeyQ' && !env.aimToggle) releaseAim(s);
}
export function mouseDown(button: number, env: ShooterEnv, s: ShooterState) {
  if (!lockedClickFire(env)) return false;
  if (button === 0) { pressFire(s, 'click'); return true; }
  if (button === 2 && env.desktopMode === 'mouse') { pressAim(s, env.aimToggle); return true; }
  return false;
}
export function mouseUp(button: number, env: ShooterEnv, s: ShooterState) {
  if (button === 0) releaseFire(s, 'click');
  else if (button === 2 && !env.aimToggle) releaseAim(s);
}
export function lookSourceFor(pointerType: string, desktopMode: 'trackpad' | 'mouse'): LookSource {
  return pointerType === 'touch' || pointerType === 'pen' ? 'touch' : desktopMode === 'mouse' ? 'mouse' : 'trackpad';
}
/** Pointers inside these elements set lookSource themselves (tap pad 'tap', Fire/Aim 'touch'). */
export const OWN_LOOK_SELECTOR = '[aria-label="Tap flight controls"], [data-shooter-controls]';
