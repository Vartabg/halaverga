// The one-line trackpad pill for the classic profiles (free cursor, captured steering). Pure and landing-safe: Experience
// imports it on the first load, so it holds no React, no three.js and no blaster UI markers.
/** canLand: a landing surface is in reach, so Space lands instead of starting the cruise. */
export type PillEnv = { steering: string; shooter: boolean; cruising: boolean; flying: boolean; canLand?: boolean };

const CRUISE = 'MOVE TO STEER · SCROLL FOR SPEED · CLICK TO HOVER';
const START = 'CLICK TO FLY · DRAG TO LOOK';

/**
 * Free cursor with the blaster on (Garo 2026-09-24): while stopped a click fires and a drag looks; W or Space starts flying
 * (Space only on the ground; with a surface in reach Space lands). Blaster off: the 7945430 lines. Captured: its own cruise line. Every other profile: null.
 */
export function trackpadPill({ steering, shooter, cruising, flying, canLand = false }: PillEnv): string | null {
  if (steering === 'free') {
    if (cruising) return shooter ? `${CRUISE} · HOLD C TO FIRE` : CRUISE;
    if (!shooter) return START;
    if (flying && canLand) return 'W TO FLY · SPACE TO LAND · CLICK TO FIRE · DRAG TO LOOK';
    return flying ? 'W OR SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK' : 'SPACE TO FLY · CLICK TO FIRE · DRAG TO LOOK';
  }
  if (steering === 'captured') return cruising ? `${CRUISE} + RELEASE` : START;
  return null;
}
