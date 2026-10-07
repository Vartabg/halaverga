import type { KeyboardEvent } from 'react';
import type { ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';

/**
 * Closes the Controls sheet and puts focus back: paused (the sheet came from the pause card's or Flight settings' Controls row), on that
 * row once the pause card is back; in live desktop play, on the scene (digits and Space keep working); otherwise on the trigger.
 */
export function closeControls(family: ControlFamily) {
  useGame.setState({ controlsOpen: false });
  const g = useGame.getState(), live = family === 'desktop' && g.started && !g.paused;
  if (g.paused) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="controls-row"]')?.focus({ preventScroll: true })); return; }
  (live ? document.getElementById('expedition') : document.querySelector<HTMLElement>('[data-testid="controls-trigger"]'))?.focus({ preventScroll: true });
}
/** Escape closes only the sheet: stopping it here keeps useInput's window handler from pausing. */
export const closeOnEscape = (family: ControlFamily) => (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || !useGame.getState().controlsOpen) return;
  e.preventDefault(); e.stopPropagation(); closeControls(family);
};
