'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { controlKey, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { canVote, livePlay, readMark, TRIED_S, triedIds, type VotePlay } from '@/ui/vote/voteTracker';
import { useCurrentControl } from './ControlList';
import styles from './ControlsPicker.module.css';

/** Controls counted as tried, and the seconds still needed to count the one being flown (TRIED_S down to 0). */
export function chipProgress(play: VotePlay, family: ControlFamily, current: ControlId) {
  return { tried: triedIds(play, family).length, left: Math.max(0, Math.ceil(TRIED_S - (play.secs[controlKey(family, current)] ?? 0))) };
}
/** Spoken after the visible `Vote n/2` (the visible text stays inside the accessible name). */
export const chipHint = (tried: number) => `. Fly ${tried === 0 ? 'two ways' : 'one more way'} for ${TRIED_S} seconds first.`;

/**
 * The header Vote button, always there after Begin until this family has voted. Below two tried controls it shows the progress and
 * the seconds left on the control being flown; from two on it is the lime call to vote. The play record is read once a second,
 * and only while fewer than two are tried. It sits in the picker's third grid column, so the trigger never moves.
 */
export default function VoteChip({ family }: { family: ControlFamily }) {
  const current = useCurrentControl(family);
  const snap = () => { const p = chipProgress(livePlay(), family, current); return `${p.tried}|${p.left}`; };
  const watch = useCallback((fn: () => void) => {
    const t = setInterval(() => { if (triedIds(livePlay(), family).length < VOTE_MIN_TRIED) fn(); }, 1000);
    return () => clearInterval(t);
  }, [family]);
  const s = useSyncExternalStore(watch, snap, snap);
  useGame(x => x.voteOpen); // the card closing is the moment a sent vote takes the chip away
  if (!canVote(readMark(), Date.now(), family)) return null;
  const [tried, left] = s.split('|').map(Number), ready = tried >= VOTE_MIN_TRIED;
  return <button type="button" className={styles.chip} data-testid="vote-chip" data-ready={ready ? '' : undefined}
    onMouseDown={e => e.preventDefault()} onClick={() => useGame.setState({ voteOpen: true })}>
    <span className={styles.chipText}>{ready ? <>Vote<span className={styles.chipMore}>: which felt best?</span></> : <>
      {`Vote ${tried}/${VOTE_MIN_TRIED}`}
      {left > 0 && <span aria-hidden="true"><span className={styles.chipDot}>{' · '}</span>{`${left} s`}</span>}
    </>}</span>
    {!ready && <span className="sr-only">{chipHint(tried)}</span>}
  </button>;
}
