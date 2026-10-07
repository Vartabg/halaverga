'use client';
import { useEffect, useId, useRef } from 'react';
import { controlsFor, type ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { canVote, readMark } from '@/ui/vote/voteTracker';
import { pause } from '../useInput';
import ControlList, { useTried } from './ControlList';
import { useKeysPref } from './keysPref';
import { useVoteState, VOTE_NAME } from './useVoteState';
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
 * The sheet's footer Vote: the lime primary, there only while the vote works (two ways flown, not voted, ballot not known closed).
 * Once this family's vote is sent (V7) it is the outlined `Vote sent: see results`, which still opens the card with the thanks and the
 * results link. While the vote is locked there is no button at all: the tried line says how far along it is.
 */
export function VoteButton({ family }: { family: ControlFamily }) {
  const { state } = useVoteState(family);
  if (state === 'sent') return <button type="button" className={styles.action} data-testid="controls-vote" data-sent=""
    onClick={() => useGame.setState({ voteOpen: true })}>Vote sent: see results</button>;
  return state === 'ready' ? <button type="button" className={`${styles.action} ${styles.primary}`} data-testid="controls-vote" aria-label={VOTE_NAME}
    onClick={() => useGame.setState({ voteOpen: true })}>Vote</button> : null;
}

/**
 * On touch, a one-line way from the sheet to Flight settings (size, left-handed, look speed live there): Pause, then the dialog. It shares
 * the tried line's row, so it adds no height to the footer; the name carries what is in there (it starts with the visible words, 2.5.3).
 */
function SettingsLink() {
  return <button type="button" className={styles.link} data-testid="controls-settings" aria-label="Flight settings: size, left-handed, look speed"
    onClick={() => { pause(); useGame.setState({ panel: true }); }}>Flight settings</button>;
}

/**
 * The non-modal controls sheet (a dialog that does not trap focus or block the world): a bottom sheet on a phone, a popover under the top
 * row on a desktop or tablet (ControlsPicker.module.css). The list scrolls; the footer stays put, so Vote (when it works) and Done are
 * reachable in a short landscape window. Escape and the backdrop are the layer's.
 */
export default function ControlsSheet({ family, onClose }: { family: ControlFamily; onClose: () => void }) {
  const id = useId(), ref = useRef<HTMLDivElement>(null);
  // Focus lands on the checked radio and the list scrolls it into view (a checked row below the fold is not left hidden).
  useEffect(() => { ref.current?.querySelector<HTMLInputElement>('input:checked')?.focus(); }, []);
  return <div ref={ref} role="dialog" aria-modal="false" aria-labelledby={`${id}h`} className={styles.sheet} data-testid="controls-sheet" data-family={family}>
    <h2 id={`${id}h`} className={styles.title}>Controls</h2>
    <div className={styles.sheetBody} data-scroll-ok="">
      <ControlList family={family} name="controls-sheet" onPicked={(_, how) => { if (how.touch) onClose(); }} />
    </div>
    <div className={styles.foot}>
      {family === 'desktop' ? <><TriedLine family={family} /><KeysToggle /></> : <div className={styles.footLine}><TriedLine family={family} /><SettingsLink /></div>}
      <div className={styles.buttons}>
        <VoteButton family={family} />
        <button type="button" className={styles.action} data-testid="controls-done" onClick={onClose}>Done</button>
      </div>
    </div>
  </div>;
}
