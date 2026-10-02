'use client';
import { useEffect } from 'react';
import { controlById, type ControlFamily } from '@/game/controlTypes';
import { clearInput } from '@/game/runtime';
import { useGame } from '@/game/store';
import { useCurrentControl } from './ControlList';
import VoteChip from './VoteChip';
import { closeControls, closeOnEscape } from './closeControls';
import { useControlFamily } from './useControlFamily';
import { useRowExtra } from './useRowExtra';
import { lockedTail, useReadyToast, useVoteState } from './useVoteState';
import styles from './ControlsPicker.module.css';
// The top row's Vote pill and Controls button (a lazy chunk, mounted after Begin and shown only while playing). The sheet itself is
// ControlsLayer, a sibling of the header, so the header's touch pass-through never has to cover it. Opening drops held input but the
// game keeps running. The visible word is `Controls`; the accessible name adds the control's name after it (the visible text stays a prefix
// of the name: WCAG 2.5.3; an aria-label, because a visually hidden span makes Chrome read "Controls : Draw"). While the vote is locked the
// button also carries two dots, and the name ends with their text twin. The dots' slot is always reserved, so the button is the same width
// in every state and only the Vote pill appears or goes. DOM order is Vote, Controls (then Pause, which Experience renders after this).

/** `family` is for tests; the page follows the last pointer. */
export default function ControlsPicker({ family: forced }: { family?: ControlFamily }) {
  const started = useGame(s => s.started), paused = useGame(s => s.paused), voteOpen = useGame(s => s.voteOpen), open = useGame(s => s.controlsOpen);
  const followed = useControlFamily(), family = forced ?? followed, current = useCurrentControl(family);
  const vote = useVoteState(family), locked = vote.state === 'locked';
  useReadyToast(vote.state);
  useRowExtra();
  // Warm the lab chunk so the first switch to Draw, Conduct or Brush mounts without a network wait.
  useEffect(() => { import('../gesture/LabControls').catch(() => { /* the switch still works; the chunk loads on demand */ }); }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.controlId = current;
    return () => { delete html.dataset.controlId; };
  }, [current]);
  // The vote card or a lost game: the sheet steps aside. So does a CHANGE of `paused` (Pause pressed with the sheet open: the header sits
  // above the backdrop, one tap pauses and closes it). The pause card's and Flight settings' Controls rows open the sheet while the game
  // is already paused, which is no change, so it stays open there. If this component goes (the world failed), no flag is left behind.
  const close = () => { if (useGame.getState().controlsOpen) useGame.setState({ controlsOpen: false }); };
  useEffect(close, [paused]);
  useEffect(() => { if (voteOpen || !started) close(); }, [voteOpen, started]);
  useEffect(() => () => { close(); }, []);
  if (!started || paused) return null;

  const toggle = () => { if (open) closeControls(family); else { clearInput(); useGame.setState({ controlsOpen: true }); } };
  return <div className={styles.root} onKeyDown={closeOnEscape(family)}>
    {vote.state === 'ready' && <VoteChip />}
    <button type="button" className={styles.trigger} data-testid="controls-trigger" aria-haspopup="dialog" aria-expanded={open}
      aria-label={`Controls: ${controlById(current).label}${locked ? lockedTail(vote.tried) : ''}`} onMouseDown={e => e.preventDefault()} onClick={toggle}>
      Controls
      <span className={styles.dots} data-testid="vote-dots" aria-hidden="true">{locked && [0, 1].map(i => <i key={i} data-on={vote.tried > i ? '' : undefined} />)}</span>
    </button>
  </div>;
}
