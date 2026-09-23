import { resetShooterFeel } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { clearShooterFault } from '@/game/shooterFault';
import { persistGame, useGame } from '@/game/store';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
// Aim hold/toggle and Aim assist live under More controls (MoreControls.tsx): the blaster section keeps two choices.
const COARSE_NOTE = 'The suit fires when the crosshair rests on a drone. Turn off for a Fire button.';
const FINE_NOTE = 'Mouse: left click fires once the mouse is captured. Trackpad, one finger + keyboard: click to fire; other trackpad modes: hold C. On touch screens the suit fires by itself when the crosshair rests on a drone. Reduced camera motion also removes zoom, recoil, shake, tracers and flashes.';
export default function ShooterSettings({ coarse }: { coarse: boolean }) {
  const shooter = useGame(s => s.shooter), autoFire = useGame(s => s.autoFire);
  return <fieldset><legend>Suit blaster</legend>
    <label className={styles.check}><input type="checkbox" checked={shooter} onChange={e => {
      // Off returns assist friction, blends and springs to exact rest so look input is never left slowed; the store change
      // closes the blaster audio. On: save first, so the unlock (this click is a gesture) sees the blaster enabled.
      if (e.target.checked) { clearShooterFault(); save({ shooter: true }); unlockBlasterAudio(); }
      else { resetShooterFeel(runtime.shooter); save({ shooter: false }); }
    }} /> Suit blaster (drones and shooting)</label>
    {shooter && <>
      <label className={styles.check}><input type="checkbox" checked={autoFire} onChange={e => save({ autoFire: e.target.checked })} /> Auto-fire on touch screens</label>
      {/* A phone gets one line about its own controls; mouse and trackpad copy is for fine pointers. */}
      <p className={styles.muted}>{coarse ? COARSE_NOTE : FINE_NOTE}</p>
    </>}
  </fieldset>;
}
