import { useEffect, useRef } from 'react';
import { banish } from '@/game/banishState';
import { flowTarget } from '@/game/combatFlow';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { aimFrameFrom, createAimFrame, project } from '@/game/gesture/screenRay';
import styles from './BattleHud.module.css';
import { combatCameraReadout as camera } from '@/game/combatCamera';
/** Preview the assisted click target. DOM-only, no camera writer or React updates in the frame loop. */
export default function CombatTarget() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const point = { x: 0, y: 0 }, aim = createAimFrame(), rect = { left: 0, top: 0, width: innerWidth, height: innerHeight }; let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = ref.current, s = runtime.shooter;
      if (!el) return;
      el.dataset.camera = JSON.stringify(camera);
      rect.width = innerWidth; rect.height = innerHeight; aimFrameFrom(s.aim, rect, performance.now(), aim);
      const i = useGame.getState().paused ? -1 : flowTarget(banish, s, runtime.position);
      const visible = i >= 0 && project(aim, s.targets[i].c, point) && point.x > 28 && point.x < innerWidth - 28 && point.y > 85 && point.y < innerHeight - 90;
      el.hidden = !visible;
      if (visible) {
        el.style.transform = `translate(${point.x}px,${point.y}px)`;
        el.dataset.target = String(i); el.dataset.x = point.x.toFixed(1); el.dataset.y = point.y.toFixed(1);
      }
    };
    frame(); return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} hidden className={styles.target} aria-hidden="true" data-testid="combat-target"><i /><span>STRIKE</span></div>;
}
