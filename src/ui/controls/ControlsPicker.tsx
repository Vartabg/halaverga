'use client';
import { useEffect, useRef, useState } from 'react';
import { controlById, type ControlFamily } from '@/game/controlTypes';
import { clearInput } from '@/game/runtime';
import { useGame } from '@/game/store';
import { useCurrentControl } from './ControlList';
import ControlsSheet from './ControlsSheet';
import VoteChip from './VoteChip';
import { useControlFamily } from './useControlFamily';
import styles from './ControlsPicker.module.css';
// The header trigger 'Controls: <label>' and its sheet: every control of the family in one list (a lazy chunk, mounted after Begin).
// Opening drops held input but the game keeps running. The sheet is a non-modal dialog, so the cursor over it never steers the view;
// Escape closes it (and never pauses); the backdrop closes on click only, so no press reaches the flight surface. The Vote chip sits
// beside the trigger (its own grid column, so the trigger never moves) until this family has voted.

/** `family` is for tests; the page follows the last pointer. */
export default function ControlsPicker({ family: forced }: { family?: ControlFamily }) {
  const started = useGame(s => s.started), paused = useGame(s => s.paused), voteOpen = useGame(s => s.voteOpen);
  const followed = useControlFamily(), family = forced ?? followed, current = useCurrentControl(family);
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  // Warm the lab chunk so the first switch to Draw, Conduct or Brush mounts without a network wait.
  useEffect(() => { import('../gesture/LabControls').catch(() => { /* the switch still works; the chunk loads on demand */ }); }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.controlId = current;
    return () => { delete html.dataset.controlId; };
  }, [current]);
  // The vote card, a pause (settings, guide, the pause card) or a lost game: the sheet steps aside.
  useEffect(() => { if (voteOpen || paused || !started) setOpen(false); }, [voteOpen, paused, started]);
  if (!started) return null;

  const close = () => {
    setOpen(false);
    const g = useGame.getState(), live = family === 'desktop' && g.started && !g.paused;
    (live ? document.getElementById('expedition') : trigger.current)?.focus({ preventScroll: true });
  };
  const toggle = () => { if (open) close(); else { clearInput(); setOpen(true); } };
  const label = controlById(current).label;
  return <div className={styles.root} onKeyDown={e => {
    if (!open || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); close(); // useInput's window Escape would pause
  }}>
    <button ref={trigger} type="button" className={styles.trigger} data-testid="controls-trigger" aria-haspopup="dialog" aria-expanded={open}
      onMouseDown={e => e.preventDefault()} onClick={toggle}>{`Controls: ${label}`}</button>
    <VoteChip family={family} />
    {open && <>
      <div className={styles.backdrop} aria-hidden="true" data-testid="controls-backdrop" onClick={close} />
      <ControlsSheet family={family} onClose={close} />
    </>}
  </div>;
}
