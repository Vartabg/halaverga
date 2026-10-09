import { SPEED } from './motion';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

// Small aiming corrections stay at a gentle cruise speed.
export function thumbThrottle(distance: number) {
  const t = clamp((distance - 24) / 96, 0, 1);
  return (8 + (SPEED.surge - 8) * t * t * (3 - 2 * t)) / SPEED.surge;
}

// Holding at an edge keeps turning without lifting or using another finger (main 7945430, restored 2026-09-26: linear over
// min(44, 0.1 x size) px; the rate is 1.5 rad/s in Player, edgeTurn.ts thumbTurn).
export function thumbEdge(position: number, size: number) {
  const margin = Math.min(44, size * .1);
  return clamp((position - size + margin) / margin, 0, 1) - clamp((margin - position) / margin, 0, 1);
}

/**
 * Signed edge factor (turn-360 spec 1.3): +1 within `full` px of the far edge (size), -1 within `full` px of 0, easing (smoothstep)
 * to 0 at `band` px in. Symmetric, so both directions turn alike. Desktop cursor only.
 */
export function edgeFactor(p: number, size: number, band: number, full: number) {
  const span = Math.max(1, band - full);
  return smooth((band - (size - p)) / span) - smooth((band - p) / span);
}

/** Desktop free cursor: the pointer can reach the very edge, so the full zone is a narrow 12 px. */
export const deskEdge = (position: number, size: number) => edgeFactor(position, size, Math.min(72, size * .1), 12);
