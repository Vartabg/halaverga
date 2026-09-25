import { SPEED } from './motion';
const STROKE_LIMIT = 160, QUIET_MS = 180;
const pixels = (delta: number, mode: number, height: number) => delta * (mode === 1 ? 16 : mode === 2 ? height : 1);
export function cruiseThrottle(current: number, delta: number, mode: number, pageHeight: number) {
  if (!Number.isFinite(delta)) return current;
  const change = Math.max(-STROKE_LIMIT, Math.min(STROKE_LIMIT, pixels(delta, mode, pageHeight))) * .00125;
  return Math.max(3 / SPEED.surge, Math.min(1, current - change));
}
type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; momentum?: boolean };
export class ScrollStroke {
  private last = -Infinity;
  private used = 0;
  private direction = 0;
  private blocked = false;
  stop(now: number) { this.blocked = true; this.last = now; this.used = 0; this.direction = 0; }
  apply(current: number, event: WheelSample, now: number, height: number, reverse = false) {
    const quiet = now - this.last >= QUIET_MS;
    this.last = now;
    if (event.momentum === true) return current;
    if (this.blocked && event.momentum !== false && !quiet) return current;
    this.blocked = false;
    if (![event.deltaX, event.deltaY].every(Number.isFinite) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return current;
    const delta = pixels(event.deltaY, event.deltaMode, height) * (reverse ? -1 : 1);
    const direction = Math.sign(delta);
    if (quiet || direction !== this.direction) this.used = 0;
    this.direction = direction;
    const accepted = Math.min(Math.abs(delta), STROKE_LIMIT - this.used);
    this.used += accepted;
    return cruiseThrottle(current, direction * accepted, 0, height);
  }
}
export const edgeFreshness = (seconds: number) => Math.max(0, Math.min(1, (0.28 - seconds) / .16));
/**
 * How the free cursor left the window while cruising (turn-360 spec 1.5): 1 = through a side (keep turning), 2 = through the top or
 * bottom (fly straight after a short grace). A side exit needs the last point inside the side band and deeper into it than into the
 * top/bottom band; a corner or a point outside every band counts as 2.
 */
export function exitKind(x: number, y: number, w: number, h: number): 1 | 2 {
  const bx = Math.min(72, w * .1), by = Math.min(72, h * .1);
  const side = x <= bx ? bx - x : x >= w - bx ? x - (w - bx) : -1;
  const vert = y <= by ? by - y : y >= h - by ? y - (h - by) : -1;
  return side >= 0 && side > vert ? 1 : 2;
}
