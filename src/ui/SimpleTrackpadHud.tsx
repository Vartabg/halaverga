import { HINT_STEPS, useGame } from '@/game/store';
import styles from './Flow.module.css';

export default function SimpleTrackpadHud() {
  const engaged = useGame(s => s.trackpadFlying), flying = useGame(s => s.flying), blaster = useGame(s => s.shooter), simpleDone = useGame(s => s.hintProgress.simple >= HINT_STEPS.simple);
  const hinting = useGame(s => s.hintVisible);
  // With the blaster on the progressive controls hint teaches the controls one at a time, alone on screen (this panel steps
  // aside while a hint shows); once the series is done the panel adds only a reminder.
  if (blaster && hinting) return null;
  if (blaster) return <div className={styles.hud} data-testid="simple-trackpad-hud">
    <div className={styles.readout}><span>ONE FINGER + KEYS</span></div>
    {simpleDone && <p>{engaged ? 'ESC TO PAUSE' : 'CLICK THE SCENE TO LOOK FREELY'}</p>}
  </div>;
  const locked = 'CLICK TO STOP + FREE POINTER · ESC TO PAUSE';
  return <div className={styles.hud} data-testid="simple-trackpad-hud">
    <div className={styles.readout}><span>ONE FINGER + KEYS</span></div>
    {/* With the blaster the capture click never lifts (keys fly), so on the ground it too only frees the view. */}
    <p>{engaged ? 'SLIDE TO LOOK · HOLD WASD TO MOVE · RELEASE KEYS TO HOVER' : flying || blaster ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER'}</p>
    <small>R / F RISE / DESCEND · SHIFT SURGE · SPACE LIFT / LAND<br />{engaged ? locked : 'DRAG OR ARROW KEYS TO LOOK · ESC TO PAUSE'}</small>
  </div>;
}
