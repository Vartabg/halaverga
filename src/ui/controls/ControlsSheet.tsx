'use client';
import { useEffect, useId, useRef } from 'react';
import { controlsFor, type ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { canVote, readMark } from '@/ui/vote/voteTracker';
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
/**
 * 'Tried n of 2 needed to vote' while two are not tried, this list has a Vote button (`voting`) and the family has not voted (CODE-9);
 * otherwise 'Tried n of N'. One target at a time, announced politely as more get played.
 */
export function TriedLine({ family, voting = true }: { family: ControlFamily; voting?: boolean }) {
  const n = useTried(family).length, need = voting && n < VOTE_MIN_TRIED && canVote(readMark(), Date.now(), family);
  return <p className={styles.tried} aria-live="polite" data-testid="controls-tried">
    {need ? `Tried ${n} of ${VOTE_MIN_TRIED} needed to vote` : `Tried ${n} of ${controlsFor(family).length}`}</p>;
}
/**
 * The sheet's footer button is the lime primary (`primary`); the settings and pause-card copies stay outlined. Once this family's vote
 * is sent (V7) it is never lime and says so: it still opens the card, which shows the thanks and the results link.
 */
export function VoteButton({ family, primary = false }: { family: ControlFamily; primary?: boolean }) {
  useGame(s => s.voteOpen); // the card closing is the moment a sent vote changes this button
  const sent = !canVote(readMark(), Date.now(), family);
  return <button type="button" className={primary && !sent ? `${styles.action} ${styles.primary}` : styles.action} data-testid="controls-vote"
    data-sent={sent ? '' : undefined} onClick={() => useGame.setState({ voteOpen: true })}>{sent ? 'Vote sent: see results' : 'Vote: which felt best?'}</button>;
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
        <VoteButton family={family} primary />
        <button type="button" className={styles.action} data-testid="controls-done" onClick={onClose}>Done</button>
      </div>
    </div>
  </div>;
}
