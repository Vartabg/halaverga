'use client';
import { controlById } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { useCurrentControl } from './ControlList';
import { TriedLine } from './ControlsSheet';
import { useControlFamily } from './useControlFamily';
import pause from '../Experience.module.css';
import styles from './ControlsPicker.module.css';

/**
 * The one door from a paused screen to the Controls sheet: a row with the word, the control in use now, and a chevron. The pause card
 * and Flight settings each carry one (the list itself lives only in the sheet). From Flight settings (`fromPanel`) the settings dialog
 * closes as the sheet opens; either way the game stays paused, and closing the sheet shows the pause card again.
 */
export function ControlsRow({ fromPanel = false }: { fromPanel?: boolean }) {
  const current = useCurrentControl(useControlFamily());
  return <button type="button" className={`${pause.secondary} ${styles.rowButton}`} data-testid="controls-row" aria-haspopup="dialog"
    onClick={() => useGame.setState(fromPanel ? { panel: false, controlsOpen: true } : { controlsOpen: true })}>
    <b>Controls</b><span>{controlById(current).label}</span><i aria-hidden="true">›</i>
  </button>;
}

/**
 * The pause card's vote door: the ask above the button for a player who is eligible (they may never land to get the auto-open), the
 * button alone otherwise. It lives in this chunk, not in PauseCard, so its words are not in the landing's zero-headroom first load.
 */
export function VoteDoor({ nudge }: { nudge: boolean }) {
  return <>
    {nudge && <p className={pause.voteAsk}>Which way of flying felt best?</p>}
    <button className={`${pause.secondary} ${pause.voteOpen}`} data-testid="vote-open" data-nudge={nudge ? '' : undefined} onClick={() => useGame.setState({ voteOpen: true })}>Vote: which felt best?</button>
  </>;
}

/**
 * What the pause card holds of the controls (through the landing's one LazyControls door, so none of it is landing first load): the vote
 * door (V4: right under Resume for a player who is asked, after the Controls row for everyone else), the Controls row, and the tried line
 * under it, which says how many ways a vote needs while it is still locked.
 */
export default function PauseControls() {
  const nudge = useGame(s => s.voteNudge), family = useControlFamily();
  return <>
    {nudge && <VoteDoor nudge />}
    <ControlsRow />
    <TriedLine family={family} voting />
    {!nudge && <VoteDoor nudge={false} />}
  </>;
}
