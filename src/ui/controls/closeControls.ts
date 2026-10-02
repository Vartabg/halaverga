import type { KeyboardEvent } from 'react';
import type { ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';

/** Closes the Controls sheet and puts focus back: on the scene in live desktop play (digits and Space keep working), else on the trigger. */
export function closeControls(family: ControlFamily) {
  useGame.setState({ controlsOpen: false });
  const g = useGame.getState(), live = family === 'desktop' && g.started && !g.paused;
  (live ? document.getElementById('expedition') : document.querySelector<HTMLElement>('[data-testid="controls-trigger"]'))?.focus({ preventScroll: true });
}
/** Escape closes only the sheet: stopping it here keeps useInput's window handler from pausing. */
export const closeOnEscape = (family: ControlFamily) => (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || !useGame.getState().controlsOpen) return;
  e.preventDefault(); e.stopPropagation(); closeControls(family);
};
