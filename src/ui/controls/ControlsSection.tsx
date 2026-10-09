'use client';
import { useEffect, useState } from 'react';
import { controlById, type ControlFamily } from '@/game/controlTypes';
import { touchCapable } from '@/game/pointerMode';
import ControlList, { useCurrentControl } from './ControlList';
import { KeysToggle, TriedLine, VoteButton } from './ControlsSheet';
import { useControlFamily } from './useControlFamily';
import styles from './ControlsPicker.module.css';

const FAMILIES: [ControlFamily, string][] = [['touch', 'Touch'], ['desktop', 'Trackpad or mouse']];
/** A touch laptop or tablet with a keyboard: both lists make sense there. */
const bothInputs = () => touchCapable() && typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches;

/**
 * The same control list for the pause card, the Field guide and Flight settings (through the landing's one LazyControls wrapper).
 * `name` keeps the radio groups apart; 'control-guide' also carries the 'Try every control' heading (so the landing files hold no copy).
 * Collapsed in a details on short screens. `vote` adds the vote button.
 */
export default function ControlsSection({ name, vote = false }: { name: string; vote?: boolean }) {
  const followed = useControlFamily(), [chosen, setChosen] = useState<ControlFamily | null>(null), [both, setBoth] = useState(false);
  const [open, setOpen] = useState(() => typeof innerHeight === 'undefined' || innerHeight >= 560);
  useEffect(() => { setBoth(bothInputs()); }, []);
  const family = both && chosen ? chosen : followed, current = useCurrentControl(family);
  return <section className={styles.section} data-testid="controls-section" data-name={name} aria-label={name === 'control-guide' ? undefined : 'Controls'}>
    {name === 'control-guide' && <h3 className={styles.sectionTitle}>Try every control</h3>}
    <details className={styles.details} open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{`Controls: ${controlById(current).label}`}</summary>
      {both && <div className={styles.switch} role="group" aria-label="Control family">
        {FAMILIES.map(([f, text]) => <button key={f} type="button" aria-pressed={f === family} onClick={() => setChosen(f)}>{text}</button>)}
      </div>}
      <ControlList family={family} name={name} />
      <TriedLine family={family} />
      {family === 'desktop' && <KeysToggle />}
      {vote && <VoteButton />}
    </details>
  </section>;
}
