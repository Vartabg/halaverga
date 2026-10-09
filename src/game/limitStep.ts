import type { FlightSafety } from './FlightSafety';
import type { Vec } from './motion';
import { keepSlide, paceClosing, softenBounds } from './navigation';
import { limitCue, type LimitCue } from './limitCue';
import { peeling } from './limitSteer';
// A cue stays for CUE_HOLD_S after its cause flickers off (the solid look-ahead reports every other step in a slide), so the hint on the
// 0.15 s store tick does not blink. Module state: reset when flight stops and by the harness.
const CUE_HOLD_S = .4;
let held: LimitCue = '', left = 0;
export const resetCueHold = () => { held = ''; left = 0; };
export const holdCue = (raw: LimitCue): LimitCue => { if (raw) { held = raw; left = CUE_HOLD_S; return raw; } left -= 1 / 60; return left > 0 ? held : ''; };
/**
 * The velocity side of the limits, one call for Player.tsx and the headless harness: the soft limiter for the six district faces,
 * the solid look-ahead (FlightSafety.anticipate), the full-speed slide at the ceiling and floor (keepSlide), and the cue.
 * `target` is what the controls ask for (motion.flightTarget). `prev` is last step's velocity (the ramp holds against a turn-away push).
 * `contact` is the sweep hit that changed the velocity, if any.
 */
export function limitStep(safe: FlightSafety, p: Vec, v: Vec, target: Vec, prev: Vec) {
  const a = safe.anticipate(p, softenBounds(p, paceClosing(p, prev, v))), velocity = keepSlide(p, a.velocity, target, peeling());
  return { velocity, contact: a.contact, cue: holdCue(limitCue(p, velocity, a.ahead, !!a.contact)) };
}
