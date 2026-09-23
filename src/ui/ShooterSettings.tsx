import { resetShooterFeel } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { clearShooterFault } from '@/game/shooterFault';
import { persistGame, useGame } from '@/game/store';
import { unlockBlasterAudio } from './audioUnlock';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
export default function ShooterSettings() {
  const shooter = useGame(s => s.shooter), aimToggle = useGame(s => s.aimToggle), aimAssist = useGame(s => s.aimAssist);
  return <fieldset><legend>Suit blaster</legend>
    <label className={styles.check}><input type="checkbox" checked={shooter} onChange={e => {
      // Off returns assist friction, blends and springs to exact rest so look input is never left slowed; the store change
      // closes the blaster audio. On: save first, so the unlock (this click is a gesture) sees the blaster enabled.
      if (e.target.checked) { clearShooterFault(); save({ shooter: true }); unlockBlasterAudio(); }
      else { resetShooterFeel(runtime.shooter); save({ shooter: false }); }
    }} /> Suit blaster (drones and shooting)</label>
    <div className={styles.segment}>
      <button aria-pressed={!aimToggle} onClick={() => save({ aimToggle: false })}>Hold to aim</button>
      <button aria-pressed={aimToggle} onClick={() => save({ aimToggle: true })}>Toggle aim</button>
    </div>
    <label className={styles.setting}>Aim assist<select value={aimAssist < .5 ? '0' : aimAssist < 1.25 ? '1' : '1.5'} onChange={e => save({ aimAssist: Number(e.target.value) })}>
      <option value="0">Off</option><option value="1">Standard</option><option value="1.5">Strong</option>
    </select></label>
    <p className={styles.muted}>Touch: Fire button, drag it to aim (hold near an edge to keep turning); Aim toggles precision. Mouse: left click fires, right click aims. Trackpad: hold C to fire, Q to aim. Reduced camera motion also removes zoom, recoil, shake, tracers and flashes.</p>
  </fieldset>;
}
