'use client';
import { useGame } from '@/game/store';
import { VOTE_NAME } from './useVoteState';
import styles from './ControlsPicker.module.css';

/**
 * The top row's Vote pill. It exists only while the vote works (the picker mounts it when useVoteState says `ready`: two ways flown,
 * this family has not voted, the ballot is not known closed), so it is never a disabled or placeholder button. Before that the Controls
 * button carries two dots instead. The visible word is `Vote`; the accessible name adds the question after it (WCAG 2.5.3).
 */
export default function VoteChip() {
  return <button type="button" className={styles.chip} data-testid="vote-chip" aria-label={VOTE_NAME}
    onMouseDown={e => e.preventDefault()} onClick={() => useGame.setState({ voteOpen: true })}>Vote</button>;
}
