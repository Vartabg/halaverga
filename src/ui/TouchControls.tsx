import { useRef, useState, type PointerEvent } from 'react';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
export default function TouchControls() {
  const move = useRef<{ id: number; x: number; y: number } | null>(null);
  const view = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const paused = useGame(s => s.paused);
  if (paused) return null;
  const startMove = (e: PointerEvent<HTMLDivElement>) => {
    if (move.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    move.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const dragMove = (e: PointerEvent<HTMLDivElement>) => {
    const m = move.current; if (!m || m.id !== e.pointerId) return;
    const dx = e.clientX - m.x, dy = e.clientY - m.y, length = Math.max(48, Math.hypot(dx, dy));
    runtime.touch = { strafe: dx / length, forward: -dy / length };
    setStick({ x: m.x, y: m.y, dx: dx / length * 36, dy: dy / length * 36 });
  };
  const endMove = () => { move.current = null; runtime.touch = { forward: 0, strafe: 0 }; runtime.surge = false; useGame.setState({ surging: false }); setStick(null); };
  return <>
    <div className={styles.moveSurface} aria-hidden="true" onPointerDown={startMove} onPointerMove={dragMove}
      onPointerUp={endMove} onPointerCancel={endMove} onLostPointerCapture={endMove} />
    <div className={styles.lookSurface} aria-hidden="true" onPointerDown={e => {
      if (view.current) return;
      if (e.pointerType === 'mouse' && !document.pointerLockElement) {
        document.querySelector('canvas')?.requestPointerLock?.();
      } else { e.currentTarget.setPointerCapture(e.pointerId); view.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    }} onPointerMove={e => {
      const p = view.current; if (!p || p.id !== e.pointerId) return;
      look(e.clientX - p.x, e.clientY - p.y); view.current = { id: p.id, x: e.clientX, y: e.clientY };
    }} onPointerUp={() => { view.current = null; }} onPointerCancel={() => { view.current = null; }} onLostPointerCapture={() => { view.current = null; }} />
    {stick && <div className={styles.stick} style={{ left: stick.x, top: stick.y }} aria-hidden="true">
      <span style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} /></div>}
  </>;
}
