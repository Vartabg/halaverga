// Cannon drive: turns the shot choreography and the weapon state into the numbers the runtime cannon (ArmCannon, -19) reads: slide
// travel, vent hatch, and the core, strip, fin and ring emissive levels and colours. Runs every frame the blaster is on, right after
// advanceShotBody. Writes plain numbers into an existing CannonDrive: no allocation.
import type { ShooterState } from '../game/combat';
import { HEAT } from '../game/combat';
import { heat01 } from '../game/weapon';
import { COLORS, SLIDE_MAX, cannonDrive, type CannonDrive, type RGB } from './cannonContract';
import { CH } from './shotSprings';
import type { ShotBody } from './shotBody';

/** Core lens level while locked: a clear red glow (at .15 the dim lens plus a sun highlight read peach, like skin: review r2). */
export const LOCK_CORE = .3;
/** Ring glow (muzzle lip, collar and slide coils, mask B) at rest; aim raised .3, firing .45. */
export const RING_REST = .2;
/** Per-shot slide travel at unit spring value (m), the flare size and decay, and the heat-ramp thresholds (the HUD's). */
export const DRIVE = { slide: .022, flare: .4, flareTau: .05, firing: .3, lowerRate: 9, amberAt: .6, hotAt: .85, blend: .05,
  swellHz: 1.5, swell: .25, lockSwell: [.69, .89] as const } as const;
const clamp01 = (v: number) => v <= 0 ? 0 : v >= 1 ? 1 : v;
const smooth = (lo: number, hi: number, v: number) => { const t = clamp01((v - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(out: RGB, a: RGB, b: RGB, t: number) { out.r = lerp(a.r, b.r, t); out.g = lerp(a.g, b.g, t); out.b = lerp(a.b, b.b, t); }

/** The per-shot core flare: .4 e^(-age / 50 ms), summed over the recent shots, times the motion gain; 0 under reduced motion. */
export function flareOf(b: ShotBody, reduced: boolean) {
  if (reduced || b.m === 0) return 0;
  let sum = 0;
  for (let i = 0; i < b.shotT.length; i++) {
    const age = b.time - b.shotT[i];
    if (age >= 0 && age < 1) sum += Math.exp(-age / DRIVE.flareTau);
  }
  return DRIVE.flare * sum * b.m;
}
/** Heat colour ramp with the HUD thresholds: cool (or `from`) below .6, amber .6-.85, hot above .85, each blended over +-.05.
 * Returns warmth. */
export function heatColor(h: number, out: RGB, from: RGB = COLORS.cool) {
  const warm = smooth(DRIVE.amberAt - DRIVE.blend, DRIVE.amberAt + DRIVE.blend, h), hot = smooth(DRIVE.hotAt - DRIVE.blend, DRIVE.hotAt + DRIVE.blend, h);
  mix(out, from, COLORS.amber, warm); mix(out, out, COLORS.hot, hot);
  return warm;
}
/** Writes this frame's cannon drive. aimWeight is the arm's aim weight (0..1). */
export function writeCannonDrive(b: ShotBody, s: ShooterState, aimWeight: number, reduced: boolean, d: CannonDrive = cannonDrive) {
  const w = s.weapon, aw = clamp01(aimWeight), flare = flareOf(b, reduced), h = clamp01(heat01(w));
  // Firing level: 1 within .3 s of a shot, then easing down at the arm's lowering rate (9/s), so the core never steps.
  const firing = w.sinceShot < DRIVE.firing ? 1 : Math.exp(-DRIVE.lowerRate * (w.sinceShot - DRIVE.firing));
  d.slide = Math.min(SLIDE_MAX, Math.max(0, b.springs.x[CH.slide] * DRIVE.slide * b.m, SLIDE_MAX * b.hatch));
  d.vent = Math.max(0, b.hatch);
  // The ring set (mask B: muzzle lip, collar, slide coils) keeps a low cyan glow at rest so the barrel reads as an energy weapon
  // side-on (visual review r2).
  d.ring = lerp(RING_REST + (.3 - RING_REST) * aw, .45, firing) + .5 * flare / DRIVE.flare;
  if (w.lock > 0) {
    const fade = Math.max(0, 1 - w.lockT / HEAT.lock), u = (w.lockT - DRIVE.lockSwell[0]) / (DRIVE.lockSwell[1] - DRIVE.lockSwell[0]);
    const bump = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
    // While the hatch stands open the cavity, fins and strips keep at least 3/4 of their glow, so the open vent reads as a hot red
    // grille until it shuts (fading with the lock alone, the exposed copper fins read as a pale skin-coloured patch: review r2).
    const glow = .6 * Math.max(fade, .75 * clamp01(b.hatch));
    d.core = LOCK_CORE; mix(d.coreColor, COLORS.hot, COLORS.hot, 0);
    mix(d.stripColor, COLORS.hot, COLORS.amber, bump); d.strip = glow * (1 + .6 * bump);
    d.fins = glow;
    return d;
  }
  // Relaxed .25, aim raised .45, firing .55, plus the flare (peak about 1): the lens stays a saturated cyan spot, never white.
  d.core = lerp(.25 + .2 * aw, .55, firing) + flare;
  // The core lens is the largest glow seen from behind, so it carries the heat ramp too (cyan, amber, red), like the strips.
  heatColor(h, d.coreColor, COLORS.fringe);
  const warm = heatColor(h, d.stripColor), hot = smooth(DRIVE.hotAt - DRIVE.blend, DRIVE.hotAt + DRIVE.blend, h);
  const swell = 1 + DRIVE.swell * hot * Math.sin(2 * Math.PI * DRIVE.swellHz * b.time);
  d.strip = lerp(.2 + .25 * aw, .6, warm) * swell;
  d.fins = .6 * clamp01((h - .8) / .2);
  return d;
}
