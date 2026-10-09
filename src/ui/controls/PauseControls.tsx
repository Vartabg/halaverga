'use client';
import { controlById } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { useCurrentControl } from './ControlList';
import { TriedLine } from './ControlsSheet';
import { useControlFamily } from './useControlFamily';
import { useVoteState, VOTE_NAME } from './useVoteState';
import { QUESTION } from '@/ui/vote/question';
import pause from '../Experience.module.css';
import styles from './ControlsPicker.module.css';

/**
 * The one door from a paused screen to the Controls sheet: a row with the word, the control in use now, and a chevron. The pause card
 * and Flight settings each carry one (the list itself lives only in the sheet). From Flight settings (`fromPanel`) the settings dialog
 * closes as the sheet opens; either way the game stays paused, and closing the sheet shows the pause card again.
 */
export function ControlsRow({ fromPanel = false }: { fromPanel?: boolean }) {
  const label = controlById(useCurrentControl(useControlFamily())).label;
  // The name is the top row's `Controls: <label>`: the visible words are its two parts, in order (WCAG 2.5.3).
  return <button type="button" className={`${pause.secondary} ${styles.rowButton}`} data-testid="controls-row" aria-haspopup="dialog" aria-label={`Controls: ${label}`}
    onClick={() => useGame.setState(fromPanel ? { panel: false, controlsOpen: true } : { controlsOpen: true })}>
    <b>Controls</b><span>{label}</span><i aria-hidden="true">›</i>
  </button>;
}

/**
 * The pause card's vote door: there only while the vote works (two ways flown, this family has not voted, the ballot is not known
 * closed), with the question above the button for a player who is also asked (`nudge`: they may never land to get the auto-open).
 * The visible word is `Vote`; the accessible name adds the question. It lives in this chunk, not in PauseCard, so its words are not in
 * the landing's zero-headroom first load.
 */
export function VoteDoor({ nudge }: { nudge: boolean }) {
  return <>
    {nudge && <p className={pause.voteAsk}>{QUESTION}</p>}
    <button className={`${pause.secondary} ${pause.voteOpen}`} data-testid="vote-open" data-nudge={nudge ? '' : undefined} aria-label={VOTE_NAME}
      onClick={() => useGame.setState({ voteOpen: true })}>Vote</button>
  </>;
}

/**
 * What the pause card holds of the controls (through the landing's one LazyControls door, so none of it is landing first load): the vote
 * door when the vote works (V4: right under Resume, so it is on screen on a phone), the Controls row, and the tried line under it, which
 * says how many ways a vote needs while it is still locked. A locked, closed or sent vote shows no button here.
 */
export default function PauseControls() {
  const nudge = useGame(s => s.voteNudge), family = useControlFamily(), { state } = useVoteState(family);
  return <>
    {state === 'ready' && <VoteDoor nudge={nudge} />}
    <ControlsRow />
    <TriedLine family={family} voting />
  </>;
}
