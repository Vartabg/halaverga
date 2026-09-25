'use client';
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useGame } from '@/game/store';
import { onTouchCapable, touchCapable } from '@/game/pointerMode';
import { LAB_IDS, LAB_NAMES } from './labStats';
import { pickLab, rovingNext, useLabKeys } from './labBarKeys';
import styles from './LabBar.module.css';
// Spec 2: the one-tap lab switcher in the header (Standard · Draw · Conduct · Brush), a lazy chunk. An APG radio group with a
// roving tabIndex. A pick switches at once and never pauses; a mouse press takes no focus, so Space and the arrows keep flying.
// Keys 1-4 do the same on desktop (labBarKeys). The pause card and Flight settings keep the full picker and the rating.

/** Desktop (never touch-capable) announces the 1-4 shortcuts. SSR and the first client render assume desktop. */
const desktopNow = () => !touchCapable();
const useDesktop = () => useSyncExternalStore(onTouchCapable, desktopNow, () => true);

export default function LabBar() {
  const scheme = useGame(s => s.controlLab), started = useGame(s => s.started), reduced = useGame(s => s.reduced);
  const desktop = useDesktop();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useLabKeys();
  // Warm the lab controls chunk so the first switch away from Standard mounts without a network wait.
  useEffect(() => { import('./LabControls').catch(() => { /* the switch still works; the chunk loads on demand */ }); }, []);
  if (!started) return null;

  const current = Math.max(0, LAB_IDS.indexOf(scheme));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = refs.current.indexOf(e.target as HTMLButtonElement);
    const next = rovingNext(from >= 0 ? from : current, e.key);
    if (next === null) return;
    // The group owns these keys: useInput never sees them, so the view does not turn. A held arrow moves once (no remount storm).
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    pickLab(LAB_IDS[next]);
    refs.current[next]?.focus();
  };

  return <div role="radiogroup" aria-label="Controls" data-testid="lab-bar" className={styles.bar}
    data-reduced={reduced} onKeyDown={onKeyDown}>
    {LAB_IDS.map((id, i) => {
      const checked = id === scheme;
      return <button key={id} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={checked} data-lab={id}
        tabIndex={checked ? 0 : -1} aria-keyshortcuts={desktop ? String(i + 1) : undefined} className={styles.seg}
        onMouseDown={e => e.preventDefault()} onClick={() => pickLab(id)}>
        {LAB_NAMES[id]}<kbd aria-hidden="true" className={styles.kbd}>{i + 1}</kbd>
      </button>;
    })}
  </div>;
}
