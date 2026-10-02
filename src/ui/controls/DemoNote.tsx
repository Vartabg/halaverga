'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/game/store';
import { demoSeen, markDemoSeen } from './demoSeen';
import styles from './ControlsPicker.module.css';

export const DEMO_COPY = 'A demo of new ways to fly. After you begin, try each in the Controls menu, then vote.';

/** True for the store change that is Begin, when the note has a box on screen (`display:none` leaves it none). */
export const seenAtBegin = (now: { started: boolean }, was: { started: boolean }, note: { getClientRects(): ArrayLike<unknown> } | null) =>
  now.started && !was.started && !!note && note.getClientRects().length > 0;

/**
 * First visits, inside the start card under the hint: passive text, no button (nothing to tap, nothing to dismiss). It counts as seen when
 * Begin removes the start card, and only if it was on screen then: a landscape phone under 430 px high hides it by CSS, and a note nobody
 * could read comes back next visit. "On screen" is read from the rendered note (a hidden element has no boxes), never from being mounted.
 * Begin is watched on the store, not on unmount, so a development double-mount cannot mark it seen early.
 */
export default function DemoNote() {
  const [open] = useState(() => !demoSeen()), note = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    return useGame.subscribe((now, was) => { if (seenAtBegin(now, was, note.current)) markDemoSeen(); });
  }, [open]);
  if (!open) return null;
  return <div ref={note} role="note" className={styles.demo} data-testid="demo-note"><p>{DEMO_COPY}</p></div>;
}
