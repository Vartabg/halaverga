// Pure HUD timing and geometry. Times are seconds. Marker timing lives in JS because globals.css disables CSS animation
// under reduced motion. The optional out objects let the HUD's frame loop reuse one object instead of allocating.
export type MarkerKind = 'hit' | 'weak' | 'kill' | 'blocked';
export type Marker = { visible: boolean; scale: number; opacity: number; rotate: number };
export type Vent = { sweep01: number; windowStart01: number; windowEnd01: number; inWindow: boolean };
export const POP_T = .07, HOLD_END = .16, MARKER_T = .3, KILL_T = .45, FADE_T = MARKER_T - HOLD_END;
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * Pop 1.4 -> 1 over 70 ms (ease-out cubic), hold 90 ms, fade 140 ms, gone at 300 ms. Kill: a larger red diagonal X (1.15x, never
 * rotated, so it stays off the crosshair's axes) that fades until 450 ms. rotate is kept at 0 for callers that read it.
 */
export function markerState(kind: MarkerKind, age: number, reduced: boolean,
  out: Marker = { visible: false, scale: 1, opacity: 0, rotate: 0 }): Marker {
  const kill = kind === 'kill', base = kill ? 1.15 : 1, end = kill ? KILL_T : MARKER_T;
  out.rotate = 0;
  out.visible = age >= 0 && age < end;
  if (!out.visible) { out.scale = base; out.opacity = 0; return out; }
  const u = 1 - clamp01(age / POP_T);
  out.scale = reduced ? base : base * (1 + .4 * u * u * u);
  out.opacity = age <= HOLD_END ? 1 : 1 - (age - HOLD_END) / (end - HOLD_END);
  return out;
}

/** Screen radius (px) of the true spread cone: the drawn cone equals the camera's cone. */
export function crosshairRadius(spreadHalf: number, fovDeg: number, heightPx: number, acquired: boolean) {
  const r = Math.tan(spreadHalf) / Math.tan(fovDeg * Math.PI / 360) * heightPx / 2;
  return Math.max(7, r) * (acquired ? .8 : 1);
}

const POP_W = 2 * Math.PI * 5, POP_Z = .6, POP_WD = POP_W * Math.sqrt(1 - POP_Z * POP_Z), POP_K = POP_Z / Math.sqrt(1 - POP_Z * POP_Z);
/** 1 + amp at the shot, then an underdamped return (5 Hz, zeta .6, zero start velocity, closed form) to 1. */
export function popScale(ageSinceShot: number, amp = .12) {
  if (!(ageSinceShot >= 0 && ageSinceShot < .6)) return 1;
  const t = ageSinceShot;
  return 1 + amp * Math.exp(-POP_Z * POP_W * t) * (Math.cos(POP_WD * t) + POP_K * Math.sin(POP_WD * t));
}
/** Pop amplitude from the 4th shot of a burst (index 3): attenuated so sustained fire does not smear the crosshair. */
export const POP_LATE = .06, POP_LATE_FROM = 3;

/**
 * Crosshair scale per shot: the pop (1.12, or 1.06 once burstIndex >= 3), or exactly 1 under reduced motion (the plan keeps markers
 * but drops every pop). burstIndex is the place of the last shot in its burst (burst.ts lastShotIndex).
 */
export const crossScale = (sinceShot: number, reduced: boolean, burstIndex = 0) =>
  reduced ? 1 : Math.round(popScale(sinceShot, burstIndex >= POP_LATE_FROM ? POP_LATE : .12) * 1000) / 1000;

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
