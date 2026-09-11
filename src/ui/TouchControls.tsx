import { useEffect, useRef, type PointerEvent } from 'react';
import { look, releaseThumb, runtime } from '@/game/runtime';
import { thumbEdge, thumbThrottle } from '@/game/thumbFlight';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
type Contact = { id: number; x: number; y: number; lastX: number; lastY: number };
export default function TouchControls() {
  const contact = useRef<Contact | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marker = useRef<HTMLDivElement>(null), knob = useRef<HTMLSpanElement>(null);
  const paused = useGame(s => s.paused);
  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; contact.current = null; releaseThumb();
    if (marker.current) marker.current.hidden = true;
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    releaseThumb();
  }, []);
  const activate = () => {
    if (!contact.current || useGame.getState().paused) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    runtime.thumb.active = true; runtime.thumb.throttle = thumbThrottle(0);
    if (marker.current) marker.current.hidden = false;
  };
  if (paused) return null;
  const start = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && !document.pointerLockElement) document.querySelector('canvas')?.requestPointerLock?.();
      return;
    }
    // A second contact belongs to pinch zoom; stop flight before yielding it.
    if (contact.current || !e.isPrimary) { finish(); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    contact.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
    if (marker.current) { marker.current.style.left = `${e.clientX}px`; marker.current.style.top = `${e.clientY}px`; }
    if (knob.current) knob.current.style.transform = 'translate(0, 0)';
    timer.current = setTimeout(activate, 180);
  };
  const drag = (e: PointerEvent<HTMLDivElement>) => {
    const p = contact.current; if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, distance = Math.hypot(dx, dy);
    if (!runtime.thumb.active && distance >= 8) activate();
    if (runtime.thumb.active) {
      look((e.clientX - p.lastX) * 1.6, (e.clientY - p.lastY) * 1.6);
      runtime.thumb.throttle = thumbThrottle(distance);
      runtime.thumb.edgeTurn = thumbEdge(e.clientX, window.innerWidth);
      runtime.thumb.edgePitch = -thumbEdge(e.clientY, window.innerHeight);
      runtime.thumb.bank = Math.max(-1, Math.min(1, (e.clientX - p.lastX) / 12));
      const radius = Math.max(1, distance / 28);
      if (knob.current) knob.current.style.transform = `translate(${dx / radius}px, ${dy / radius}px)`;
    }
    p.lastX = e.clientX; p.lastY = e.clientY;
  };
  const end = (e: PointerEvent<HTMLDivElement>) => { if (contact.current?.id === e.pointerId) finish(); };
  return <>
    <div className={styles.flightSurface} aria-hidden="true" data-testid="flight-surface"
      onPointerDown={start} onPointerMove={drag} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
    <div ref={marker} hidden className={styles.stick} aria-hidden="true"><span ref={knob} /></div>
  </>;
}
