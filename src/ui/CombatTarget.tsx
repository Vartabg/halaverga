import { useEffect, useRef } from 'react';
import { banish, MODE } from '@/game/banishState';
import { strike } from '@/game/strike';
import { LAST, pressTarget } from '@/game/swordString';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { aimFrameFrom, createAimFrame, project } from '@/game/gesture/screenRay';
import styles from './BattleHud.module.css';
import { combatCameraReadout as camera } from '@/game/combatCamera';
/** Show the current strike until contact, then the next chain candidate, including a direction cue outside the view. */
export default function CombatTarget() {
  const ref = useRef<HTMLDivElement>(null), ring = useRef<HTMLElement>(null), label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const point = { x: 0, y: 0 }, aim = createAimFrame(), rect = { left: 0, top: 0, width: innerWidth, height: innerHeight }; let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = ref.current, s = runtime.shooter, state = useGame.getState();
      if (!el || !ring.current || !label.current) return;
      el.dataset.camera = JSON.stringify(camera);
      rect.width = innerWidth; rect.height = innerHeight; aimFrameFrom(s.aim, rect, performance.now(), aim);
      const active = strike.phase === 1 && strike.target >= 0;
      const queued = strike.queued, next = strike.queueTarget;
      const explicit = queued && next >= 0 && s.targets[next]?.alive && s.targets[next].los && banish.mode[next] < MODE.down;
      const i = state.paused || !state.shooter ? -1 : active ? strike.target : explicit ? next : pressTarget(banish, s, runtime.position);
      const target = i >= 0 ? s.targets[i] : null;
      el.hidden = !target?.alive || !s.aim.valid;
      if (el.hidden || !target) return;
      const at = active ? strike.aim : target.c, inFront = project(aim, at, point);
      // A cue at the edge points to a demon; it is not a tappable replacement for that demon's silhouette.
      const portrait = innerHeight > innerWidth, cx = innerWidth / 2, cy = innerHeight / 2;
      const left = 38, right = innerWidth - 38, top = 112, bottom = innerHeight - (portrait ? 220 : 100);
      const edge = !inFront || point.x < left || point.x > right || point.y < top || point.y > bottom;
      if (edge) {
        let dx: number, dy: number;
        if (inFront) { dx = point.x - cx; dy = point.y - cy; }
        else {
          const x = at.x - aim.origin.x, y = at.y - aim.origin.y, z = at.z - aim.origin.z;
          dx = x * aim.right.x + y * aim.right.y + z * aim.right.z;
          dy = -(x * aim.up.x + y * aim.up.y + z * aim.up.z);
          if (Math.abs(dx) + Math.abs(dy) < .01) dx = 1;
        }
        const k = Math.min(dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity,
          dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity);
        point.x = cx + dx * k; point.y = cy + dy * k;
        if (el.dataset.edge !== 'true') {
          ring.current.style.cssText = 'border:0;box-shadow:none;width:28px;height:28px;left:-14px;top:-14px;font:26px/28px system-ui';
          ring.current.textContent = '➤';
        }
        ring.current.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      } else if (el.dataset.edge !== 'false') { ring.current.style.cssText = ''; ring.current.textContent = ''; }
      const wounds = banish.wounds[i] ?? 0;
      const text = active ? 'STRIKING' : queued ? 'QUEUED' : edge ? 'TURN' : wounds >= LAST ? 'FINISH' : wounds > 0 ? `CUT ${wounds + 1}` : banish.combo > 0 ? 'CHAIN' : 'STRIKE';
      if (label.current.textContent !== text) label.current.textContent = text;
      el.style.transform = `translate(${point.x}px,${point.y}px)`;
      el.dataset.target = String(i); el.dataset.x = point.x.toFixed(1); el.dataset.y = point.y.toFixed(1);
      el.dataset.edge = String(edge); el.dataset.active = String(active); el.dataset.strikeTarget = String(strike.target);
      el.dataset.phase = String(strike.phase); el.dataset.queued = String(strike.queued);
    };
    frame(); return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} hidden className={styles.target} aria-hidden="true" data-testid="combat-target"><i ref={ring} /><span ref={label}>STRIKE</span></div>;
}
