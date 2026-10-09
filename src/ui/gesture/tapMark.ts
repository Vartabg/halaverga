import type { ArbiterOut } from '@/game/gesture/types';
// Tap to Blast has no crosshair: the shooter HUD (hit marker, heat ring) moves to the latest shot's tap point through two CSS
// variables that html[data-controls] (the lab) and html[data-input=touch][data-touch-blast] (classic one thumb) read.
/** Moves the hit marker to a screen point (client px). */
export function markAt(x: number, y: number) {
  const st = document.documentElement.style;
  st.setProperty('--lab-tap-x', `${Math.round(x)}px`); st.setProperty('--lab-tap-y', `${Math.round(y)}px`);
}
/** The lab surface's shot outputs: each one marks its tap point. */
export function markTap(o: Readonly<ArbiterOut>) {
  if (o.type === 'burst' || o.type === 'blastNow' || o.type === 'miss' || o.type === 'sustain') markAt(o.x, o.y);
}
