import { runtime } from './runtime';
import { overrideShooter, useGame } from './store';
import { resetShooterFeel } from './combat';
// React Three Fiber runs useFrame subscribers in a plain loop with no try/catch, so an uncaught shooter error would skip
// the suit, the camera rig (the per-frame invalidate caller) and the render. Every shooter frame callback goes through guarded():
// the first fault turns the blaster off for this session and flight continues. The setting is not persisted, so the next load retries.
let faulted = false;
export const shooterFaulted = () => faulted;
export function shooterFault(where: string, error: unknown): void {
  if (!faulted) console.error('[shooter] ' + where, error);
  faulted = true;
  resetShooterFeel(runtime.shooter);
  overrideShooter(false); useGame.setState({ message: 'The blaster stopped. Flight continues.' });
}
/** The settings toggle and ?shooter=1 re-enable the blaster after a fault. */
export function clearShooterFault(): void { faulted = false; }
/** Wraps a frame callback once (module scope or useMemo). No rest or spread args: they would allocate per call. */
export function guarded<A, B>(where: string, fn: (a: A, b: B) => void): (a: A, b: B) => void {
  return (a: A, b: B) => {
    if (faulted) return;
    try { fn(a, b); } catch (e) { shooterFault(where, e); }
  };
}
