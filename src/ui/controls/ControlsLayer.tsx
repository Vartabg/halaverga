'use client';
import { type ControlFamily } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import ControlsSheet from './ControlsSheet';
import { closeControls, closeOnEscape } from './closeControls';
import { useControlFamily } from './useControlFamily';
import styles from './ControlsPicker.module.css';
// The Controls sheet and its transparent backdrop, mounted as siblings of the header (Experience, after Begin): the header is
// pass-through on touch, and a sheet inside it would depend on every descendant opting back in. The backdrop takes every press and
// closes on click only, so nothing reaches the flight surface while the sheet is open; the header (Pause, Controls) stays above it.

/** `family` is for tests; the page follows the last pointer. */
export default function ControlsLayer({ family: forced }: { family?: ControlFamily }) {
  const open = useGame(s => s.controlsOpen), started = useGame(s => s.started), followed = useControlFamily(), family = forced ?? followed;
  if (!open || !started) return null;
  const close = () => closeControls(family);
  return <div className={styles.layer} onKeyDown={closeOnEscape(family)}>
    <div className={styles.backdrop} aria-hidden="true" data-testid="controls-backdrop" onClick={close} />
    <ControlsSheet family={family} onClose={close} />
  </div>;
}
