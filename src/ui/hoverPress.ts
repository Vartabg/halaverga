// The one blaster change to the classic free trackpad (Garo 2026-09-24): while stopped or on the ground a click fires and a drag
// looks, so flying starts from W or Space instead of a click. Pure and landing-safe: no React, no three.

/** dragPx: the original 7945430 drag threshold. A press that never moves this far fires once, on release; there is no hold fire. */
export const HOVER = { dragPx: 6 } as const;
/** false: on the ground W walks, as at 7945430, and only Space takes off. Flip to let W take off too. */
export const HOVER_KEYS = { wLiftsFromGround: false } as const;

export type HoverEnv = { shooter: boolean; started: boolean; paused: boolean; desktopMode: 'trackpad' | 'mouse'; steering: string; touch: boolean };

/** True when a press on the open scene fires instead of starting a cruise: the free trackpad, blaster on, live, not cruising. */
export function hoverFires(env: HoverEnv, cruising: boolean): boolean {
  return env.shooter && env.started && !env.paused && env.desktopMode === 'trackpad' && env.steering === 'free' && !env.touch && !cruising;
}

export type FlightKeyCtx = HoverEnv & { cruising: boolean; flying: boolean; landing: boolean; canLand: boolean; repeat: boolean; targetTag: string };

const TYPING = ['INPUT', 'SELECT', 'TEXTAREA'];

/**
 * 'cruise' when this key starts the free trackpad cruise (the old click); 'brake' when it stops that cruise to hover (the old
 * second click, so a keyboard-only player can always stop); 'default' leaves the key to its 7945430 meaning.
 * W starts it only in the air (while landing it cancels and moves); Space starts it unless it lands, cancels a landing or
 * activates a focused button, and while cruising Space brakes unless a surface is in reach (then it lands, as at 7945430).
 */
export function flightKey(code: string, c: FlightKeyCtx): 'cruise' | 'brake' | 'default' {
  if (c.repeat || TYPING.includes(c.targetTag)) return 'default';
  if (c.cruising) {
    const live = hoverFires(c, false);
    return live && code === 'Space' && c.targetTag !== 'BUTTON' && !c.landing && !c.canLand ? 'brake' : 'default';
  }
  if (!hoverFires(c, false)) return 'default';
  if (code === 'KeyW') {
    if (c.landing) return 'default';
    if (c.flying) return 'cruise';
    return HOVER_KEYS.wLiftsFromGround ? 'cruise' : 'default';
  }
  if (code === 'Space') {
    if (c.targetTag === 'BUTTON' || c.landing || (c.flying && c.canLand)) return 'default';
    return 'cruise';
  }
  return 'default';
}
