import type { PointerEvent } from 'react';
// Chrome fires no `click` for a touch that is not the primary one, and iOS Safari follows the same one-touch-one-click rule (to be confirmed on a
// device), so a second finger tapping Pause or Controls while the first finger flies would do nothing. The second finger's pointerup, on the
// button it went down on and lifted over, stands in for the click; a primary pointer (mouse, pen, a lone finger, the first finger) still clicks.
/** Returns a pointerup handler: runs `act` for a second finger lifting inside the button. */
export const secondFingerTap = (act: () => void) => (e: PointerEvent<HTMLElement>) => {
  if (e.pointerType !== 'touch' || e.isPrimary) return;
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) act();
};
