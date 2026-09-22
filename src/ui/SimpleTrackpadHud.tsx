import { useGame } from '@/game/store';
import styles from './Flow.module.css';

export default function SimpleTrackpadHud() {
  const engaged = useGame(s => s.trackpadFlying), flying = useGame(s => s.flying);
  return <div className={styles.hud} data-testid="simple-trackpad-hud">
    <div className={styles.readout}><span>ONE FINGER + KEYS</span></div>
    <p>{engaged ? 'SLIDE TO LOOK · HOLD WASD TO MOVE · RELEASE KEYS TO HOVER' : flying ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER'}</p>
    <small>R / F RISE / DESCEND · SHIFT SURGE · SPACE LIFT / LAND<br />{engaged ? 'CLICK TO STOP + FREE POINTER · ESC TO PAUSE' : 'DRAG OR ARROW KEYS TO LOOK · ESC TO PAUSE'}</small>
  </div>;
}
