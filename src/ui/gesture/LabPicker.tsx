'use client';
import { useState } from 'react';
import { useGame } from '@/game/store';
import { flushLabStats, LAB_IDS, LAB_NAMES, labStats, rate, type LabId } from './labStats';
import styles from './Lab.module.css';
// Spec 8: the control lab picker for PauseCard and TestPanel. Native radios (arrow keys move and select), each with a one-line
// description and a small looping glyph of the motion; the glyph holds still under reduced motion (setting or system).
export const LAB_LINES: Record<LabId, string> = {
  standard: 'Keys, sticks and trackpad, as before.',
  draw: 'Draw a line. The hero flies along it.',
  conduct: 'Rest a finger to steer. Stir to speed up.',
  brush: 'Swipe to turn, soar and dive. Circle drones to lock on.',
};
const GLYPHS: Record<LabId, string> = {
  standard: 'M6 12h12M12 6v12M30 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0',
  draw: 'M4 19C12 21 15 5 25 6S37 19 44 9',
  conduct: 'M24 5a7 7 0 1 1 -7 7a5 5 0 0 1 5 -5a3 3 0 1 1 -3 3',
  brush: 'M5 12h15l-4-4m4 4l-4 4M31 19V5l-4 4m4-4l4 4',
};
export function LabGlyph({ id }: { id: LabId }) {
  const reduced = useGame(s => s.reduced);
  return <svg className={styles.glyph} data-reduced={reduced} viewBox="0 0 48 24" width="48" height="24" aria-hidden="true" focusable="false">
    <path className={styles.glyphBase} d={GLYPHS[id]} />
    <path className={styles.glyphInk} d={GLYPHS[id]} pathLength={100} />
  </svg>;
}

type PickerProps = { value: LabId; onChange: (id: LabId) => void; name?: string; disabled?: boolean };
export default function LabPicker({ value, onChange, name = 'control-lab', disabled = false }: PickerProps) {
  return <fieldset className={styles.picker} data-testid="lab-picker" disabled={disabled}>
    <legend>Control lab</legend>
    {LAB_IDS.map(id => <label key={id} className={styles.option}>
      <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
      <LabGlyph id={id} />
      <span><b>{LAB_NAMES[id]}</b><small>{LAB_LINES[id]}</small></span>
    </label>)}
    <p className={styles.note}>In Draw, Conduct and Brush, tap a drone to blast it.</p>
  </fieldset>;
}

/** The optional two-question rating offered for the scheme just left. Both questions may be skipped. */
export function LabRating({ scheme, onDone }: { scheme: LabId; onDone: () => void }) {
  const [beauty, setBeauty] = useState(0), [control, setControl] = useState(0);
  const question = (label: string, value: number, set: (n: number) => void, key: string) => <fieldset className={styles.rating}>
    <legend>{label}</legend>
    {[1, 2, 3, 4, 5].map(n => <label key={n}>
      <input type="radio" name={`lab-${key}-${scheme}`} value={n} checked={value === n} onChange={() => set(n)} />{n}
    </label>)}
  </fieldset>;
  const save = () => { rate(labStats(), scheme, beauty, control); flushLabStats(); onDone(); };
  return <section className={styles.rate} aria-label={`Rate ${LAB_NAMES[scheme]}`}>
    <p>How was {LAB_NAMES[scheme]}? 1 is low, 5 is high.</p>
    {question('How beautiful?', beauty, setBeauty, 'beauty')}
    {question('How in control?', control, setControl, 'control')}
    <div className={styles.rateActions}>
      <button type="button" disabled={!beauty && !control} onClick={save}>Save rating</button>
      <button type="button" onClick={onDone}>Skip</button>
    </div>
  </section>;
}
