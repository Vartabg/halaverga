import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { pressAim, pressFire, releaseFire, tapShot } from '@/game/combat';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { thumbEdge } from '@/game/thumbFlight';
import styles from './FireControls.module.css';
type Props = { onHold: (held: boolean) => void; onRelease?: () => void };
const SLOP = 3, DRAG = 1.6, EDGE_YAW = 500, EDGE_PITCH = 333.3, HIT = 6;
// Touch Fire and Aim. Fire held = trigger down; dragging the same finger aims, and holding the drag at a screen edge keeps turning.
export default function FireControls({ onHold, onRelease }: Props) {
  // Auto-fire (the default) hides Fire; Aim is opt-in under More controls, and the tap pad keeps its own Aim toggle.
  const fireOn = useGame(s => !s.autoFire), aimOn = useGame(s => s.aimButton && !s.tapControls);
  const visible = useGame(s => s.shooter && s.started && !s.paused) && (fireOn || aimOn);
  const [latched, setLatched] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), fire = useRef<HTMLButtonElement>(null);
  // l/r/t/b: Fire's hit box (the button plus its 6 px ::before), taken before the press scale. Edge turning waits until the finger
  // has left it, so a thumb resting on Fire's outer rim never turns the view.
  const hold = useRef({ id: null as number | null, x: 0, y: 0, slop: 0, prev: 0, raf: 0, l: 0, r: 0, t: 0, b: 0 });
  const aimId = useRef<number | null>(null);
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
    const out = h.slop > SLOP && (h.x < h.l || h.x > h.r || h.y < h.t || h.y > h.b);
    const e = out ? thumbEdge(h.x, innerWidth) : 0, p = out ? thumbEdge(h.y, innerHeight) : 0;
    if (e || p) look(e * EDGE_YAW * dt, p * EDGE_PITCH * dt);
    h.raf = requestAnimationFrame(tick);
  }, [end]);
  useEffect(() => { if (!visible || !fireOn) end(); }, [visible, fireOn, end]);
  useEffect(() => end, [end]);
  useEffect(() => {
    const id = setInterval(() => setLatched(runtime.shooter.input.aimLatched), 250);
    return () => clearInterval(id);
  }, []);
  if (!visible) return null;
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hold.current, s = runtime.shooter;
    if (h.id !== null || !useGame.getState().shooter) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    h.l = r.left - HIT; h.r = r.right + HIT; h.t = r.top - HIT; h.b = r.bottom + HIT;
    e.currentTarget.setPointerCapture(e.pointerId);
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
  const toggleAim = () => {
    const s = runtime.shooter;
    if (!useGame.getState().shooter) return;
    s.input.lookSource = 'touch'; pressAim(s, true); setLatched(s.input.aimLatched);
  };
  // A second-finger tap makes no click, so a touch toggles on its own pointerup (captured, still inside the button). The click
  // path is kept for keyboard and switch activation (detail 0) only, so one tap never toggles twice.
  const aimDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (aimId.current !== null) return;
    aimId.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
  };
  const aimUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (aimId.current !== e.pointerId) return;
    aimId.current = null;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) toggleAim();
    props.current.onRelease?.();
  };
  const aimLost = (e: PointerEvent<HTMLButtonElement>) => { if (aimId.current === e.pointerId) aimId.current = null; };
  return <div ref={wrap} className={styles.controls} data-shooter-controls="" data-fire-held="false">
    {fireOn && <button ref={fire} type="button" aria-label="Fire" data-testid="fire-button" className={styles.fire}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={e => { if (e.detail === 0 && useGame.getState().shooter) tapShot(runtime.shooter); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" className={styles.dot} /></svg>
    </button>}
    {aimOn && <button type="button" aria-label="Aim" aria-pressed={latched} className={styles.aim}
      onPointerDown={aimDown} onPointerUp={aimUp} onPointerCancel={aimLost} onLostPointerCapture={aimLost}
      onClick={e => { if (e.detail === 0) toggleAim(); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><circle cx="12" cy="12" r="6.5" /></svg>
    </button>}
  </div>;
}
