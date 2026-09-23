import { useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
// Progressive disclosure: advanced controls stay folded until a player opens them, and stay open for anyone already using one.
export default function MoreControls() {
  const shooter = useGame(s => s.shooter), tapControls = useGame(s => s.tapControls), aimButton = useGame(s => s.aimButton);
  const aimToggle = useGame(s => s.aimToggle), aimAssist = useGame(s => s.aimAssist);
  const [initialOpen] = useState(() => tapControls || aimButton || aimToggle || aimAssist !== 1);
  const tap = <label className={styles.check}><input type="checkbox" checked={tapControls} onChange={e => save({ tapControls: e.target.checked })} /> Show tap controls · no dragging</label>;
  // Blaster off is main's panel: the tap checkbox in main's place, with no disclosure (the blaster's advanced controls fold here).
  if (!shooter) return tap;
  return <details data-testid="more-controls" open={initialOpen}>
    <summary>More controls</summary>
    {tap}
    <label className={styles.check}><input type="checkbox" checked={aimButton} onChange={e => save({ aimButton: e.target.checked })} /> Show Aim button on touch screens</label>
    <div className={styles.segment}>
      <button aria-pressed={!aimToggle} onClick={() => save({ aimToggle: false })}>Hold to aim</button>
      <button aria-pressed={aimToggle} onClick={() => save({ aimToggle: true })}>Toggle aim</button>
    </div>
    <label className={styles.setting}>Aim assist<select value={aimAssist < .5 ? '0' : aimAssist < 1.25 ? '1' : '1.5'} onChange={e => save({ aimAssist: Number(e.target.value) })}>
      <option value="0">Off</option><option value="1">Standard</option><option value="1.5">Strong</option>
    </select></label>
    <p className={styles.muted}>Aim: hold Q, right click with a captured mouse, or the Aim button. The blaster cools by itself; pressing Fire or C as the sweep crosses the lit window cools it at once. On a touch screen that needs Auto-fire off, which brings back the Fire button.</p>
  </details>;
}
