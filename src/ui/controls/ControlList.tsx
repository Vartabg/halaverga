'use client';
import { useId, useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { controlsFor, DEFAULT_CONTROL, idFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { livePlay, triedIds } from '@/ui/vote/voteTracker';
import ControlGlyph from './ControlGlyph';
import { digitIndex } from './controlKeys';
import { selectControl } from './selectControl';
import styles from './ControlsPicker.module.css';

/** The control the store's fields describe for this family (the native radio that is checked). */
export function useCurrentControl(family: ControlFamily): ControlId {
  const controlLab = useGame(s => s.controlLab), touchScheme = useGame(s => s.touchScheme);
  const trackpadSteering = useGame(s => s.trackpadSteering), desktopMode = useGame(s => s.desktopMode);
  return idFor({ controlLab, touchScheme, trackpadSteering, desktopMode }, family);
}

// The play record is module state ticked by the vote layer, so the list looks again once a second while it is on screen.
const everySecond = (fn: () => void) => { const t = setInterval(fn, 1000); return () => clearInterval(t); };
/** Ids of this family played for TRIED_S or more (the same numbers the vote reads). */
export function useTried(family: ControlFamily): ControlId[] {
  const now = () => triedIds(livePlay(), family).join(',');
  const s = useSyncExternalStore(everySecond, now, now);
  return s ? s.split(',') as ControlId[] : [];
}

const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
export type Picked = { touch: boolean };
type Props = { family: ControlFamily; name: string; onPicked?: (id: ControlId, how: Picked) => void };

/** Every control of the family as native radios (arrow keys move and select). A touch pick reports touch, so the sheet can close. */
export default function ControlList({ family, name, onPicked }: Props) {
  const uid = useId(), current = useCurrentControl(family), tried = useTried(family);
  const rows = controlsFor(family), desktop = family === 'desktop';
  const how = useRef(''), inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pick = (id: ControlId) => { const touch = how.current === 'touch'; how.current = ''; selectControl(id, { family }); onPicked?.(id, { touch }); };
  // A tap on the row that is already current changes nothing, but on touch it still ends the sheet.
  const same = (id: ControlId) => { const touch = how.current === 'touch'; how.current = ''; if (touch) onPicked?.(id, { touch }); };
  const keys = (e: KeyboardEvent) => {
    how.current = 'key';
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // A held arrow would step through the list (and remount the controls) once per repeat.
    if (e.repeat && ARROWS.has(e.key)) { e.preventDefault(); return; }
    const i = desktop && !e.shiftKey && !e.repeat ? digitIndex(e.code, rows.length) : null;
    if (i === null) return;
    // Focus is inside the list, so the digit works whatever the shortcut preference says.
    e.preventDefault(); selectControl(rows[i].id, { family }); inputs.current[i]?.focus({ preventScroll: true });
  };
  return <fieldset className={styles.list} data-testid="controls-list" data-family={family} onKeyDown={keys}
    onPointerDown={(e: PointerEvent) => { how.current = e.pointerType; }}>
    <legend className={styles.legend}>Controls</legend>
    {rows.map((c, i) => {
      const k = `${uid}${c.id}`;
      return <label key={c.id} className={styles.row} data-control={c.id}>
        <input ref={el => { inputs.current[i] = el; }} type="radio" name={name} value={c.id} checked={c.id === current} className={styles.radio}
          aria-labelledby={`${k}n`} aria-describedby={`${k}b ${k}d${c.hint ? ` ${k}h` : ''}`} aria-keyshortcuts={desktop ? String(i + 1) : undefined}
          onChange={() => pick(c.id)} onClick={() => { if (c.id === current) same(c.id); }} />
        <ControlGlyph id={c.id} />
        <span className={styles.text}>
          <span className={styles.head}>
            <b id={`${k}n`}>{c.label}</b>
            <span id={`${k}b`} className={styles.badges}>
              {c.id === DEFAULT_CONTROL[family] && <span className={styles.badge} data-badge="default">Default</span>}
              {tried.includes(c.id) && <span className={styles.badge} data-badge="tried">Tried</span>}
            </span>
          </span>
          <small id={`${k}d`}>{c.line}</small>
          {c.hint && <small id={`${k}h`} className={styles.hint}>{c.hint}</small>}
        </span>
        {desktop && <kbd aria-hidden="true" className={styles.kbd}>{i + 1}</kbd>}
      </label>;
    })}
  </fieldset>;
}
