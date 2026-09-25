import { pressAim, pressFire, releaseAim, releaseFire, type LookSource, type ShooterState } from '../game/combat';
// Pure Fire/Aim routing for keyboard and mouse. Presses are gated; releases are not, so a hold can always end.
export type ShooterEnv = { enabled: boolean; started: boolean; paused: boolean; aimToggle: boolean; desktopMode: 'trackpad' | 'mouse'; steering: string; locked: boolean };
export type ShooterKey = { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; targetTag: string };
const live = (env: ShooterEnv) => env.enabled && env.started && !env.paused;
/** A locked primary click fires in mouse mode and in the one-finger `simple` trackpad profile (plain string: PR #12 may add it). */
export const lockedClickFire = (env: ShooterEnv) => live(env) && env.locked
  && (env.desktopMode === 'mouse' || (env.desktopMode === 'trackpad' && env.steering === 'simple'));
/**
 * What a primary press on the scene means in the one-finger `simple` profile. With the blaster on and the pointer locked it
 * fires (useShooterInput presses Fire) and never brakes; otherwise PR #12's rules hold: a locked or pending press brakes and
 * frees the pointer, and an unlocked press may engage capture on release. The engaging press therefore never fires.
 */
export type SimplePress = 'ignore' | 'fire' | 'brake' | 'engage';
export function simplePrimaryPress(e: { button: number; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, env: ShooterEnv, requesting: boolean): SimplePress {
  if (env.paused || e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return 'ignore';
  if (lockedClickFire({ ...env, desktopMode: 'trackpad', steering: 'simple' })) return 'fire';
  return env.locked || requesting ? 'brake' : 'engage';
}
/**
 * The one gate for a primary press that fires: useShooterInput's capture-phase pointerdown stops exactly these presses, so the
 * flight surface never sees them. In `simple` it is simplePrimaryPress's own 'fire' route, so a press can never both fire and brake.
 */
export const swallowsPress = (e: { button: number; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, env: ShooterEnv, requesting: boolean) =>
  e.button === 0 && (env.desktopMode === 'trackpad' && env.steering === 'simple' ? simplePrimaryPress(e, env, requesting) === 'fire' : lockedClickFire(env));
/** Keys that look or fire by hand. A press means a keyboard player is steering (an iPad keyboard, a touch laptop), so touch auto-fire
 * stands down until the next touch re-tags lookSource. Q is left out: it only aims, and a touch player may hold it while dragging. */
const HAND_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyC']);
/** Returns true when handled; the caller then calls preventDefault. A repeat is ignored, so a key held through a pause must be pressed again. */
export function keyDown(e: ShooterKey, env: ShooterEnv, s: ShooterState) {
  if (!live(env) || e.metaKey || e.ctrlKey || e.altKey || e.repeat || /^(INPUT|SELECT|TEXTAREA)$/.test(e.targetTag)) return false;
  if (HAND_KEYS.has(e.code)) s.input.lookSource = lookSourceFor('keyboard', env.desktopMode);
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
/** Touch is always 'touch'; a pen counts as touch only on a touch-capable device (a non-touch desktop treats it as its pointer). */
export function lookSourceFor(pointerType: string, desktopMode: 'trackpad' | 'mouse', capable = true): LookSource {
  return pointerType === 'touch' || (pointerType === 'pen' && capable) ? 'touch' : desktopMode === 'mouse' ? 'mouse' : 'trackpad';
}
/** Pointers inside these elements set lookSource themselves (tap pad 'tap', Fire/Aim 'touch'). */
export const OWN_LOOK_SELECTOR = '[aria-label="Tap flight controls"], [data-shooter-controls]';
