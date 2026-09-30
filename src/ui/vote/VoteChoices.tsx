'use client';
import { useId } from 'react';
import { controlById, type ControlId } from '@/game/controlTypes';
import ControlGlyph from '../controls/ControlGlyph';
import styles from './VoteCard.module.css';

export const TIE_LABEL = "Can't tell";
export const TIE_LINE = 'They felt about the same.';
type Props = {
  /** The ways flown, already in this visitor's order. */
  ids: readonly ControlId[]; value: ControlId | 'tie' | null; onChange: (v: ControlId | 'tie') => void; disabled?: boolean;
  /** The id of the question heading: it names the group, so a screen reader reads the question with each row. */
  labelledBy: string;
};

/** The ballot rows: native radios (arrow keys move and select; nothing sends), nothing pre-selected, `Can't tell` always last. No setup hints. */
export default function VoteChoices({ ids, value, onChange, disabled = false, labelledBy }: Props) {
  const uid = useId();
  const row = (id: ControlId | 'tie', label: string, line: string) => {
    const k = `${uid}${id}`;
    return <label key={id} className={styles.row} data-control={id} data-tie={id === 'tie' ? '' : undefined}>
      <input type="radio" name="vote-pick" value={id} checked={value === id} disabled={disabled} onChange={() => onChange(id)}
        aria-labelledby={`${k}n`} aria-describedby={`${k}d`} />
      {id !== 'tie' && <ControlGlyph id={id} />}
      <span className={styles.rowText}><b id={`${k}n`}>{label}</b><small id={`${k}d`}>{line}</small></span>
      <span className={styles.dot} aria-hidden="true" />
    </label>;
  };
  return <div role="radiogroup" aria-labelledby={labelledBy} className={styles.rows} data-testid="vote-choices">
    {ids.map(id => row(id, controlById(id).label, controlById(id).line))}
    {row('tie', TIE_LABEL, TIE_LINE)}
  </div>;
}
