'use client';
import { useEffect, useId, useRef } from 'react';
import { controlsFor, type ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import ControlList, { useTried } from './ControlList';
import { useKeysPref } from './keysPref';
import styles from './ControlsPicker.module.css';

/** The 'Number keys 1-8 switch controls' checkbox (desktop). One shared preference, so every copy on the page agrees. */
export function KeysToggle() {
  const [on, set] = useKeysPref();
  return <label className={styles.check}>
    <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} />Number keys 1-8 switch controls
  </label>;
}
/** 'Tried n of 2 needed to vote' until two are tried, then 'Tried n of N': one target at a time, announced politely as more get played. */
export function TriedLine({ family }: { family: ControlFamily }) {
  const n = useTried(family).length;
  return <p className={styles.tried} aria-live="polite" data-testid="controls-tried">
    {n < VOTE_MIN_TRIED ? `Tried ${n} of ${VOTE_MIN_TRIED} needed to vote` : `Tried ${n} of ${controlsFor(family).length}`}</p>;
}
/** The sheet's footer button is the lime primary (`primary`); the settings and pause-card copies stay outlined. */
export function VoteButton({ primary = false }: { primary?: boolean }) {
  return <button type="button" className={primary ? `${styles.action} ${styles.primary}` : styles.action} data-testid="controls-vote"
    onClick={() => useGame.setState({ voteOpen: true })}>Vote: which felt best?</button>;
}

/**
 * The non-modal controls sheet under the header (a dialog that does not trap focus or block the world). The list scrolls; the
 * footer stays put, so Vote (the primary) and Done are reachable in a short landscape window. Escape and the backdrop are the picker's.
 */
export default function ControlsSheet({ family, onClose }: { family: ControlFamily; onClose: () => void }) {
  const id = useId(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true }); }, []);
  return <div ref={ref} role="dialog" aria-modal="false" aria-labelledby={`${id}h`} className={styles.sheet} data-testid="controls-sheet" data-family={family} data-scroll-ok="">
    <h2 id={`${id}h`} className={styles.title}>Controls</h2>
    <div className={styles.sheetBody}>
      <ControlList family={family} name="controls-sheet" onPicked={(_, how) => { if (how.touch) onClose(); }} />
    </div>
    <div className={styles.foot}>
      <TriedLine family={family} />
      {family === 'desktop' && <KeysToggle />}
      <div className={styles.buttons}>
        <VoteButton primary />
        <button type="button" className={styles.action} data-testid="controls-done" onClick={onClose}>Done</button>
      </div>
    </div>
  </div>;
}
