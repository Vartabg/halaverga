import type { TouchButton } from '@/game/touchLayout';
import styles from './TouchControls.module.css';
// Button faces for the right-thumb cluster. Fire is a bullet (as on mobile shooters' fire buttons) and Aim a scope, so the two
// no longer read as the same targeting symbol; Rise and Descend are arrows, with a ground line when they lift off or land.
// A small caps label sits under each button until that button is first used in this page load (a blocked Descend always
// says so). The label repeats the accessible name, so the visible text is always part of it (WCAG 2.5.3).
const used = new Set<TouchButton>();
/** Records a use; true when this was the button's first, so the caller re-renders to hide its label. */
export function markUsed(b: TouchButton): boolean { if (used.has(b)) return false; used.add(b); return true; }
export const labelShown = (b: TouchButton, cue: boolean) => cue || !used.has(b);
/** Tests only. */
export function resetUsed() { used.clear(); }
export function ClusterFace({ b, text, label }: { b: TouchButton; text: string; label: boolean }) {
  return <>
    <Glyph b={b} text={text} />
    {label && <span className={styles.label} aria-hidden="true">{text}</span>}
  </>;
}
function Glyph({ b, text }: { b: TouchButton; text: string }) {
  if (b === 'fire') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-2.6 2.2-3.6 5-3.6 8V17h7.2v-6.5c0-3-1-5.8-3.6-8Z" /><rect x="7.6" y="18.6" width="8.8" height="3" rx=".8" className={styles.solid} /></svg>;
  if (b === 'aim') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M12 2v5.5M12 16.5V22M2 12h5.5M16.5 12H22" /><circle cx="12" cy="12" r="1.4" className={styles.solid} /></svg>;
  const landing = text === 'Land' || text === 'Lift off';
  const path = b === 'rise' ? 'M12 19V6M6 11l6-6 6 6' : 'M12 5v13M6 13l6 6 6-6';
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} />{landing && <path d="M4 22h16" />}</svg>;
}
