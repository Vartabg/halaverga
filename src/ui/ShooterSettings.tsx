import { resetShooterFeel } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { clearShooterFault } from '@/game/shooterFault';
import { persistGame, useGame } from '@/game/store';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
// Aim hold/toggle and the shot magnet live under More controls (MoreControls.tsx): the blaster section keeps two choices.
// Two thumbs shows Fire and the auto-fire assist; one thumb (the default) has neither: tap a drone to blast it.
const COARSE_NOTE = { twin: 'The suit fires when the crosshair rests on a drone. The Fire button is always there too.',
  classic: 'One thumb flies. Tap a drone to blast it.' };
const FINE_NOTE = 'Trackpad (default): while stopped or on the ground, a click fires at the centre reticle when you let go; dragging only looks. Space starts flying (W too, once in the air) and stops it again. Hold C to fire at any time. One finger + keyboard: click to fire once the pointer is captured. Mouse: left click fires once the mouse is captured. On touch screens, tap a drone to blast it (Two thumbs: hold the Fire button, and the assist fires when the crosshair rests on a drone). Reduced camera motion also removes zoom, recoil, shake, tracers and flashes.';
export default function ShooterSettings({ coarse }: { coarse: boolean }) {
  const shooter = useGame(s => s.shooter), autoFire = useGame(s => s.autoFire), scheme = useGame(s => s.touchScheme);
  return <fieldset><legend>Suit blaster</legend>
    <label className={styles.check}><input type="checkbox" checked={shooter} onChange={e => {
      // Off returns the blends and springs to exact rest; the store change closes the blaster audio. On: save first, so the unlock (this click is a gesture) sees the blaster enabled.
      if (e.target.checked) { clearShooterFault(); save({ shooter: true }); unlockBlasterAudio(); }
      else { resetShooterFeel(runtime.shooter); save({ shooter: false }); }
    }} /> Suit blaster (drones and shooting)</label>
    {shooter && <>
      {scheme === 'twin' && <label className={styles.check}><input type="checkbox" checked={autoFire} onChange={e => save({ autoFire: e.target.checked })} /> Auto-fire assist on touch screens</label>}
      {/* A phone gets one line about its own controls; mouse and trackpad copy is for fine pointers. */}
      <p className={styles.muted}>{coarse ? COARSE_NOTE[scheme] : FINE_NOTE}</p>
    </>}
  </fieldset>;
}
