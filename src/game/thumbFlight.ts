import { SPEED } from './motion';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Small aiming corrections stay at a gentle cruise speed.
export function thumbThrottle(distance: number) {
  const t = clamp((distance - 24) / 96, 0, 1);
  return (8 + (SPEED.surge - 8) * t * t * (3 - 2 * t)) / SPEED.surge;
}

// Holding at an edge keeps turning without lifting or using another finger.
export function thumbEdge(position: number, size: number) {
  const margin = Math.min(44, size * .1);
  return clamp((position - size + margin) / margin, 0, 1) - clamp((margin - position) / margin, 0, 1);
}
