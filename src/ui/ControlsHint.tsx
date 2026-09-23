import { useEffect, useState } from 'react';
import { useGame } from '@/game/store';
import { controlsHint, hintStaged, type HintEnv } from './hudTimeline';
import styles from './ShooterHud.module.css';
const HINT_MS = 6000;
// Once per page load. One finger + keyboard gets a second window: its full line describes the captured pointer, so that line
// waits for the first capture and is shown for its own 6 s from then (before it, a short "click the scene first" line).
let firstAt = -1, capturedAt = -1;
/** The blaster's one-line controls hint, in the band under the header, clear of the crosshair, the suit and the thumbs. */
export default function ControlsHint(env: Omit<HintEnv, 'captured'>) {
  const engaged = useGame(s => s.trackpadFlying), [, expire] = useState(0);
  const captured = hintStaged(env) && (engaged || capturedAt >= 0);
  useEffect(() => {
    const now = performance.now();
    if (firstAt < 0) firstAt = now;
    if (captured && capturedAt < 0) capturedAt = now;
    const left = (captured ? capturedAt : firstAt) + HINT_MS - now;
    if (left <= 0) return;
    const id = setTimeout(() => expire(n => n + 1), left + 16);
    return () => clearTimeout(id);
  }, [captured]);
  const at = captured ? capturedAt : firstAt;
  if (at >= 0 && performance.now() - at >= HINT_MS) return null;
  return <p className={styles.hint} aria-hidden="true" data-testid="controls-hint">{controlsHint({ ...env, captured })}</p>;
}
