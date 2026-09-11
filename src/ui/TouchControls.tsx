import { useEffect, useRef, type PointerEvent } from 'react';
import { look, releaseThumb, runtime } from '@/game/runtime';
import { AdaptiveThumbs } from '@/game/adaptiveThumbs';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
export default function TouchControls() {
  const controls = useRef(new AdaptiveThumbs()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surface = useRef<HTMLDivElement>(null), markers = useRef<(HTMLDivElement | null)[]>([]);
  const paused = useGame(s => s.paused);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const sync = () => {
    const c = controls.current, output = c.output;
    Object.assign(runtime.thumb, { active: c.active, throttle: output.forward, strafe: output.strafe, edgeTurn: output.edgeTurn, edgePitch: output.edgePitch, bank: 0 });
    if (surface.current) surface.current.dataset.controlMode = c.mode;
    const points = [...c.contacts.values()];
    markers.current.forEach((marker, i) => {
      if (!marker) return;
      const p = points[i]; marker.hidden = !c.active || !p;
      if (!p) return;
      marker.style.left = `${p.originX}px`; marker.style.top = `${p.originY}px`;
      const dx = p.x - p.originX, dy = p.y - p.originY, radius = Math.max(1, Math.hypot(dx, dy) / 28);
      const knob = marker.querySelector('span')!, label = marker.querySelector('small')!;
      knob.style.transform = `translate(${dx / radius}px, ${dy / radius}px)`;
      label.textContent = c.mode === 'dual' ? p.role === 'move' ? 'MOVE' : 'LOOK' : '';
    });
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    releaseThumb();
  }, []);
  const activate = () => {
    clearTimer();
    if (useGame.getState().paused) return;
    controls.current.activate(); sync();
  };
  if (paused) return null;
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && !document.pointerLockElement) document.querySelector('canvas')?.requestPointerLock?.();
      return;
    }
    // A stale non-primary contact after cancellation/rotation cannot restart flight.
    if (!controls.current.contacts.size && !e.isPrimary) return;
    clearTimer();
    e.currentTarget.setPointerCapture(e.pointerId);
    controls.current.start(e.pointerId, e.clientX, e.clientY); sync();
    if (controls.current.mode === 'single') timer.current = setTimeout(activate, 180);
  };
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const c = controls.current; if (!c.contacts.has(e.pointerId)) return;
    c.move(e.pointerId, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (c.active) clearTimer();
    look(c.output.lookX, c.output.lookY); sync();
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!controls.current.contacts.has(e.pointerId)) return;
    clearTimer(); controls.current.end(e.pointerId); sync();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    if (!controls.current.contacts.has(e.pointerId)) return;
    clearTimer(); controls.current.cancel(); sync();
  };
  return <>
    <div ref={surface} className={styles.flightSurface} aria-hidden="true" data-testid="flight-surface" data-control-mode="idle"
      onPointerDown={start} onPointerMove={drag} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={cancel} />
    {[0, 1].map(i => <div key={i} ref={node => { markers.current[i] = node; }} hidden className={styles.stick} aria-hidden="true"><span /><small /></div>)}
  </>;
}
