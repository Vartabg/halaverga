// Pure HUD timing and geometry. Times are seconds. Marker timing lives in JS because globals.css disables CSS animation
// under reduced motion. The optional out objects let the HUD's frame loop reuse one object instead of allocating.
export type MarkerKind = 'hit' | 'weak' | 'kill' | 'blocked';
export type Marker = { visible: boolean; scale: number; opacity: number; rotate: number };
export type Vent = { sweep01: number; windowStart01: number; windowEnd01: number; inWindow: boolean };
export const POP_T = .07, HOLD_END = .16, MARKER_T = .3, FADE_T = MARKER_T - HOLD_END;
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/** Pop 1.4 -> 1 over 70 ms (ease-out cubic), hold 90 ms, fade 140 ms, gone at 300 ms. Kill: 1.6x and 45 deg. */
export function markerState(kind: MarkerKind, age: number, reduced: boolean,
  out: Marker = { visible: false, scale: 1, opacity: 0, rotate: 0 }): Marker {
  const base = kind === 'kill' ? 1.6 : 1;
  out.rotate = kind === 'kill' ? 45 : 0;
  out.visible = age >= 0 && age < MARKER_T;
  if (!out.visible) { out.scale = base; out.opacity = 0; return out; }
  const u = 1 - clamp01(age / POP_T);
  out.scale = reduced ? base : base * (1 + .4 * u * u * u);
  out.opacity = age <= HOLD_END ? 1 : 1 - (age - HOLD_END) / FADE_T;
  return out;
}

/** Screen radius (px) of the true spread cone: the drawn cone equals the camera's cone. */
export function crosshairRadius(spreadHalf: number, fovDeg: number, heightPx: number, acquired: boolean) {
  const r = Math.tan(spreadHalf) / Math.tan(fovDeg * Math.PI / 360) * heightPx / 2;
  return Math.max(7, r) * (acquired ? .8 : 1);
}

const POP_W = 2 * Math.PI * 5, POP_Z = .6, POP_WD = POP_W * Math.sqrt(1 - POP_Z * POP_Z), POP_K = POP_Z / Math.sqrt(1 - POP_Z * POP_Z);
/** 1.12 at the shot, then an underdamped return (5 Hz, zeta .6, zero start velocity, closed form) to 1. */
export function popScale(ageSinceShot: number) {
  if (!(ageSinceShot >= 0 && ageSinceShot < .6)) return 1;
  const t = ageSinceShot;
  return 1 + .12 * Math.exp(-POP_Z * POP_W * t) * (Math.cos(POP_WD * t) + POP_K * Math.sin(POP_WD * t));
}

export const heatColor = (h01: number) => h01 < .6 ? '#58e1ff' : h01 < .85 ? '#ffb347' : '#ff5a36';

/** Lockout progress along the arc, and the vent window (ventAt +- ventHalf) as fractions of the lock time. */
export function ventState(lockT: number, lock: number, ventAt: number, ventHalf: number,
  out: Vent = { sweep01: 0, windowStart01: 0, windowEnd01: 0, inWindow: false }): Vent {
  const L = lock > 0 ? lock : 1;
  out.sweep01 = clamp01(lockT / L);
  out.windowStart01 = clamp01((ventAt - ventHalf) / L); out.windowEnd01 = clamp01((ventAt + ventHalf) / L);
  out.inWindow = lock > 0 && Math.abs(lockT - ventAt) <= ventHalf;
  return out;
}

export const chainLabel = (chain: number, sinceKill: number) => chain >= 2 && sinceKill <= 1.2 ? '×' + chain : '';

/** Screen angle (rad, y down) of a direction with camera-right component rx and camera-up component ry. */
export const pipAngle = (rx: number, ry: number) => Math.atan2(-ry, rx) || 0;

export function controlsHint(env: { coarse: boolean; desktopMode: string; steering: string }) {
  if (env.coarse) return 'FIRE BUTTON · DRAG IT TO AIM · AIM FOR PRECISION';
  if (env.desktopMode === 'mouse') return 'CLICK FIRES · RIGHT-CLICK AIMS';
  if (env.steering === 'simple') return 'CLICK FIRES · HOLD Q TO AIM · ESC FREES POINTER';
  return 'HOLD C TO FIRE · HOLD Q TO AIM · MOUSE + KEYBOARD LETS A CLICK FIRE';
}
