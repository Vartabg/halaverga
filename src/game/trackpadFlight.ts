import { SPEED } from './motion';
export function cruiseThrottle(current: number, delta: number, mode: number, pageHeight: number) {
  if (!Number.isFinite(delta)) return current;
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  const change = Math.max(-100, Math.min(100, pixels)) * .00125;
  return Math.max(3 / SPEED.surge, Math.min(1, current - change));
}
