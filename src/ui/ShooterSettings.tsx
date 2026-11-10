import { resetShooterFeel } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { clearShooterFault } from '@/game/shooterFault';
import { persistGame, useGame } from '@/game/store';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
// Aim hold/toggle and the shot magnet live under More controls (MoreControls.tsx): the blaster section keeps two choices.
// Two thumbs shows Fire; one thumb (the default) taps a demon to strike it.
const COARSE_NOTE = { twin: 'Fire strikes the demon under the crosshair.',
  classic: 'Hold Fly to move. Tap a demon to strike it.' };
const FINE_NOTE = 'Click or C launches a sword strike toward a visible demon ahead. Press again during the dive to queue another strike. Binding and casting down follow a hit automatically. On touch screens, tap or swipe successive demons. Key 1 rebukes; hold V or a second finger for the shield. Reduced camera motion removes zoom, shake and flashes.';
export default function ShooterSettings({ coarse }: { coarse: boolean }) {
  const shooter = useGame(s => s.shooter), autoFire = useGame(s => s.autoFire), scheme = useGame(s => s.touchScheme);
  return <fieldset><legend>The fight</legend>
    <label className={styles.check}><input type="checkbox" checked={shooter} onChange={e => {
      // Off returns the blends and springs to exact rest; the store change closes the blaster audio. On: save first, so the unlock (this click is a gesture) sees the blaster enabled.
      if (e.target.checked) { clearShooterFault(); save({ shooter: true }); unlockBlasterAudio(); }
      else { resetShooterFeel(runtime.shooter); save({ shooter: false }); }
    }} /> The fight (demons and the sword)</label>
    {shooter && <>
      {scheme === 'twin' && <label className={styles.check}><input type="checkbox" checked={autoFire} onChange={e => save({ autoFire: e.target.checked })} /> Auto-fire assist on touch screens</label>}
      {/* A phone gets one line about its own controls; mouse and trackpad copy is for fine pointers. */}
      <p className={styles.muted}>{coarse ? COARSE_NOTE[scheme] : FINE_NOTE}</p>
    </>}
  </fieldset>;
}
