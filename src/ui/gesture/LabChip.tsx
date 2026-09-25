'use client';
import { useGame } from '@/game/store';
import { pause } from '../useInput';
import { LAB_NAMES, type LabId } from './labStats';
import styles from './Lab.module.css';
// Spec 8: the header chip 'Lab: Draw' (44 px). It pauses like the settings button and opens the panel with the picker.
// Hidden for 'standard'. The visible text is the start of the accessible name (WCAG 2.5.3).
export default function LabChip({ scheme, onOpen }: { scheme: LabId; onOpen?: () => void }) {
  const started = useGame(s => s.started);
  if (scheme === 'standard' || !started) return null;
  const open = () => {
    pause(); useGame.setState({ panel: true });
    onOpen?.();
  };
  return <button type="button" className={styles.chip} data-testid="lab-chip" aria-label={`Lab: ${LAB_NAMES[scheme]}, pause and change controls`}
    onClick={open}>Lab: {LAB_NAMES[scheme]}</button>;
}
