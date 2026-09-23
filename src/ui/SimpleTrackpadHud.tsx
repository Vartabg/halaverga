import { useGame } from '@/game/store';
import styles from './Flow.module.css';

export default function SimpleTrackpadHud() {
  const engaged = useGame(s => s.trackpadFlying), flying = useGame(s => s.flying), blaster = useGame(s => s.shooter), toggle = useGame(s => s.aimToggle);
  // With the blaster on a locked click fires instead of braking; Escape is then the way to free the pointer.
  const locked = blaster ? `CLICK TO FIRE (HOLD FOR AUTO) · ${toggle ? 'Q TOGGLES' : 'HOLD Q TO'} AIM · ESC TO PAUSE` : 'CLICK TO STOP + FREE POINTER · ESC TO PAUSE';
  return <div className={styles.hud} data-testid="simple-trackpad-hud">
    <div className={styles.readout}><span>ONE FINGER + KEYS</span></div>
    {/* With the blaster the capture click never lifts (keys fly), so on the ground it too only frees the view. */}
    <p>{engaged ? 'SLIDE TO LOOK · HOLD WASD TO MOVE · RELEASE KEYS TO HOVER' : flying || blaster ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER'}</p>
    <small>R / F RISE / DESCEND · SHIFT SURGE · SPACE LIFT / LAND<br />{engaged ? locked : 'DRAG OR ARROW KEYS TO LOOK · ESC TO PAUSE'}</small>
  </div>;
}
