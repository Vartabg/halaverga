'use client';
import { useEffect } from 'react';
import { persistGame, useGame } from '@/game/store';
import { pause } from './useInput';
import { hintInput, pickHint, slotHidden } from './hintQueue';
import styles from './Experience.module.css';

const MESSAGE_MS = 4000;
/**
 * `message` (a control's name after a switch, a sound nudge, a lab fault, a vote toast) clears 4 s after it is set. While a dialog covers the
 * slot the clock waits, so a message set under the Controls sheet is on screen for its 4 s once the sheet closes (the name of the control just
 * picked is not lost).
 */
export function useMessageClock() {
  const message = useGame(s => s.message), hidden = useGame(slotHidden);
  useEffect(() => {
    if (!message || hidden) return;
    const id = setTimeout(() => useGame.setState({ message: '' }), MESSAGE_MS);
    return () => clearTimeout(id);
  }, [message, hidden]);
}

/**
 * The one hint slot under the top row: one line, one style, never stacked. What it says is hintQueue.pickHint (a message, the Municipal
 * record, a landing, a limit, then the controls lesson). Passive text, so the flight surface under it still flies; only the record's Read
 * button takes touches (44 px). It exists only while playing and not under a dialog. The lesson keeps `controls-hint` with its track and
 * step for the specs; the spoken copy of a lesson is ControlsHint's own live region.
 */
export default function HintSlot() {
  const kind = useGame(s => pickHint(hintInput(s))?.kind ?? ''), text = useGame(s => pickHint(hintInput(s))?.text ?? ''), coach = useGame(s => s.coach);
  if (!kind) return null;
  const read = () => { pause(); useGame.setState({ discovered: true, journal: true }); persistGame(); };
  return <p className={styles.hint} data-testid="hint-slot" data-kind={kind}>
    {kind === 'record' ? <button type="button" className={styles.read} onClick={read}>{text}</button>
      : kind === 'coach' ? <span data-testid="controls-hint" data-track={coach?.track} data-step={coach?.step} aria-hidden="true">{text}</span> : text}
  </p>;
}
