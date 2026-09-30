'use client';
import type { ControlId } from '@/game/controlTypes';
import { VOTE_MIN_TRIED } from '@/lib/vote/ballot';
import { TRIED_S } from './voteTracker';
import { VOTE_NAMES } from './voteClient';
import styles from './VoteCard.module.css';

type Props = {
  /** Controls counted as tried so far (20 s each), and the suggested next one (null when none is left to suggest). */
  count: number; suggestion: ControlId | null; onTry: (id: ControlId) => void; onKeep: () => void;
};

/** The state for a visitor who has flown fewer than two ways: what is missing and a one-tap way to get it, never a dead end. */
export default function VoteNeed({ count, suggestion, onTry, onKeep }: Props) {
  return <>
    <p className={styles.need} data-testid="vote-need-more">
      {`Fly a second way for ${TRIED_S} seconds, then vote. You have flown ${Math.min(count, VOTE_MIN_TRIED)} of ${VOTE_MIN_TRIED} so far.`}
      {suggestion === null && ' Open Controls to switch.'}
    </p>
    <div className={styles.buttons}>
      {suggestion !== null && <button type="button" className={styles.send} data-testid="vote-try" onClick={() => onTry(suggestion)}>
        {`Try ${VOTE_NAMES[suggestion]} for ${TRIED_S} seconds`}</button>}
      <button type="button" className={suggestion === null ? styles.send : styles.skip} onClick={onKeep}>Keep playing</button>
    </div>
  </>;
}
