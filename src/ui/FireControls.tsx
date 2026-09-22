import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { pressAim, pressFire, releaseFire, tapShot } from '@/game/combat';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { thumbEdge } from '@/game/thumbFlight';
import styles from './FireControls.module.css';
type Props = { onHold: (held: boolean) => void; onRelease?: () => void };
const SLOP = 3, DRAG = 1.6, EDGE_YAW = 500, EDGE_PITCH = 333.3;
// Touch Fire and Aim. Fire held = trigger down; dragging the same finger aims, and holding the drag at a screen edge keeps turning.
export default function FireControls({ onHold, onRelease }: Props) {
  const visible = useGame(s => s.shooter && s.started && !s.paused);
  const [latched, setLatched] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), fire = useRef<HTMLButtonElement>(null);
  const hold = useRef({ id: null as number | null, x: 0, y: 0, slop: 0, prev: 0, raf: 0 });
  const props = useRef({ onHold, onRelease });
  useEffect(() => { props.current = { onHold, onRelease }; });
  const end = useCallback(() => {
    const h = hold.current, s = runtime.shooter;
    if (h.id === null) return;
    releaseFire(s, 'touch');
    if (s.input.touchId === h.id) s.input.touchId = null;
    h.id = null; cancelAnimationFrame(h.raf); h.raf = 0;
    if (fire.current) { fire.current.style.transform = ''; fire.current.removeAttribute('data-held'); }
    if (wrap.current) wrap.current.dataset.fireHeld = 'false';
    props.current.onHold(false);
  }, []);
  const tick = useCallback(function tick(now: number) {
    const h = hold.current;
    if (h.id === null) return;
    // Pause, resize, rotation, lock loss or a mouse press elsewhere can drop the hold from outside.
    if (runtime.shooter.input.touchId !== h.id || !useGame.getState().shooter) { end(); return; }
    const dt = Math.min(Math.max((now - h.prev) / 1000, 0), .05); h.prev = now;
    const e = h.slop > SLOP ? thumbEdge(h.x, innerWidth) : 0, p = h.slop > SLOP ? thumbEdge(h.y, innerHeight) : 0;
    if (e || p) look(e * EDGE_YAW * dt, p * EDGE_PITCH * dt);
    h.raf = requestAnimationFrame(tick);
  }, [end]);
  useEffect(() => { if (!visible) end(); }, [visible, end]);
  useEffect(() => end, [end]);
  useEffect(() => {
    const id = setInterval(() => setLatched(runtime.shooter.input.aimLatched), 250);
    return () => clearInterval(id);
  }, []);
  if (!visible) return null;
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hold.current, s = runtime.shooter;
    if (h.id !== null || !useGame.getState().shooter) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    s.input.touchId = e.pointerId; s.input.lookSource = 'touch'; pressFire(s, 'touch');
    e.currentTarget.style.transform = 'scale(.92)'; e.currentTarget.setAttribute('data-held', '');
    if (wrap.current) wrap.current.dataset.fireHeld = 'true';
    h.id = e.pointerId; h.x = e.clientX; h.y = e.clientY; h.slop = 0; h.prev = performance.now();
    props.current.onHold(true);
    h.raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hold.current;
    if (h.id !== e.pointerId) return;
    if (runtime.shooter.input.touchId !== h.id) { end(); return; }
    const dx = e.clientX - h.x, dy = e.clientY - h.y;
    if (h.slop <= SLOP) h.slop += Math.hypot(dx, dy);
    if (h.slop > SLOP) look(dx * DRAG, dy * DRAG);
    h.x = e.clientX; h.y = e.clientY;
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (hold.current.id !== e.pointerId) return;
    end(); props.current.onRelease?.();
  };
  const cancel = (e: PointerEvent<HTMLButtonElement>) => { if (hold.current.id === e.pointerId) end(); };
  return <div ref={wrap} className={styles.controls} data-shooter-controls="" data-fire-held="false">
    <button ref={fire} type="button" aria-label="Fire" data-testid="fire-button" className={styles.fire}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={e => { if (e.detail === 0 && useGame.getState().shooter) tapShot(runtime.shooter); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" className={styles.dot} /></svg>
    </button>
    <button type="button" aria-label="Aim" aria-pressed={latched} className={styles.aim}
      onClick={() => {
        const s = runtime.shooter;
        if (!useGame.getState().shooter) return;
        s.input.lookSource = 'touch'; pressAim(s, true); setLatched(s.input.aimLatched);
      }}
      onPointerUp={() => props.current.onRelease?.()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><circle cx="12" cy="12" r="6.5" /></svg>
    </button>
  </div>;
}
