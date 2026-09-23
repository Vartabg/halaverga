// Burst counter (pure, landing-safe): which shot of the current burst is firing. A burst ends when the gap before the next shot is
// longer than BURST_GAP. From the 4th shot (index ATTENUATE_FROM) the per-shot feedback is attenuated: crosshair pop 1.12 -> 1.06,
// muzzle halo alpha .45 -> .30 and the fire voice -1.5 dB, so sustained 9/s fire does not smear.
import { EVENT_RING, type ShooterState } from './combat';
import { WEAPON } from './weapon';

export type Burst = { index: number; shots: number; lastT: number };
/** index: the next shot's place in the burst (0 = first). shots: shots in the burst so far. lastT: clock time of the last shot. */
export const burst: Burst = { index: 0, shots: 0, lastT: -Infinity };
export const ATTENUATE_FROM = 3, BURST_GAP = .25, SHOT_GAIN_LATE = .8414;
const PERIOD = 1 / WEAPON.rate;
/** Burst index of each shot event, by serial (the same ring slot pushEvent uses), for consumers that read events later. */
const byEvent = new Int32Array(EVENT_RING);

/**
 * Called by stepShooter right after advanceWeapon with the n shots about to be resolved. The first of them fired sinceShot + (n - 1)/9
 * s ago; when that is more than BURST_GAP after the previous shot (or the clock went backwards), a new burst starts at index 0.
 */
export function advanceBurst(b: Burst, s: ShooterState, n: number) {
  if (s.clock < b.lastT) resetBurst(b);
  if (!(n > 0)) return;
  const last = s.clock - s.weapon.sinceShot, first = last - (n - 1) * PERIOD;
  if (first - b.lastT > BURST_GAP) { b.index = 0; b.shots = 0; }
  b.shots += n; b.lastT = last;
}
/** The current shot's place in the burst; fireShot increments burst.index after using it. */
export const burstIndex = () => burst.index;
/** The place of the most recent shot (the HUD pop follows the last shot, not the next one). */
export const lastShotIndex = () => Math.max(0, burst.index - 1);
/** Records the burst index of the shot event just pushed (serial = s.eventSerial). */
export function markShotEvent(serial: number, index: number) { byEvent[(serial - 1) % EVENT_RING] = index; }
/** The burst index a shot event was fired at (valid while the event is still in the ring). */
export const eventBurstIndex = (serial: number) => byEvent[(serial - 1) % EVENT_RING];
export const attenuated = (index: number) => index >= ATTENUATE_FROM;
/** Epoch or clock reset: the next shot starts a burst. */
export function resetBurst(b: Burst = burst) { b.index = 0; b.shots = 0; b.lastT = -Infinity; }
