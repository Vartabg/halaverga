'use client';
import type { ControlId } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import styles from './ControlsPicker.module.css';

// A 48x24 picture of each control's motion: a faint base line plus one ink stroke that loops along it. Static under the reduced
// setting or the system preference (CSS). Draw, Conduct and Brush use the lab picker's paths as they were.
const PATHS: Record<ControlId, string> = {
  'one-finger': 'M9 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M11 16C13 8 24 6 39 7m-5-4l5 4l-5 4',
  'twin-stick': 'M5 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M33 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M10 12h.01M38 12h.01',
  cursor: 'M8 3v14l4-4l3 6l3-1l-3-6h6zM27 9h15m-4-4l4 4l-4 4',
  'one-finger-keys': 'M4 3v13l3-3l3 5l2-1l-3-5h5zM22 4h6v6h-6zM30 4h6v6h-6zM26 12h6v6h-6z',
  flow: 'M4 17C11 3 16 3 22 11S33 21 44 6',
  captured: 'M14 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M24 2v5M24 17v5M9 12h5M34 12h5',
  'mouse-keys': 'M6 6a5 5 0 0 1 5 -5h2a5 5 0 0 1 5 5v9a5 5 0 0 1 -5 5h-2a5 5 0 0 1 -5 -5zM12 1v8M28 6h14v12h-14z',
  draw: 'M4 19C12 21 15 5 25 6S37 19 44 9',
  conduct: 'M24 5a7 7 0 1 1 -7 7a5 5 0 0 1 5 -5a3 3 0 1 1 -3 3',
  brush: 'M5 12h15l-4-4m4 4l-4 4M31 19V5l-4 4m4-4l4 4',
};
export default function ControlGlyph({ id }: { id: ControlId }) {
  const reduced = useGame(s => s.reduced);
  return <svg className={styles.glyph} data-reduced={reduced} viewBox="0 0 48 24" width="48" height="24" aria-hidden="true" focusable="false">
    <path className={styles.glyphBase} d={PATHS[id]} />
    <path className={styles.glyphInk} d={PATHS[id]} pathLength={100} />
  </svg>;
}
