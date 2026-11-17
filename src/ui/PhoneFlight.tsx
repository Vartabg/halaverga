import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
/** This button requests movement. Player remains the only body writer. */
export default function PhoneFlight() {
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<{ id: number; epoch: number; x: number; y: number } | null>(null);
  const pulse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    if (!hold.current && !pulse.current) return;
    hold.current = null;
    if (pulse.current) clearTimeout(pulse.current);
    pulse.current = null; runtime.stick.forward = 0; button.current?.removeAttribute('data-held');
  }, []);
  useEffect(() => {
    addEventListener('blur', release); addEventListener('resize', release);
    return () => { removeEventListener('blur', release); removeEventListener('resize', release); release(); };
  }, [release]);
  const fly = () => {
    const g = useGame.getState(); if (!g.started || g.paused) return false;
    runtime.stick.forward = 1; if (!g.flying) runtime.lift = true;
    runtime.shooter.input.lookSource = 'touch'; return true;
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (hold.current || !fly()) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    hold.current = { id: e.pointerId, epoch: runtime.touchEpoch, x: e.clientX, y: e.clientY };
    e.currentTarget.setAttribute('data-held', '');
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const h = hold.current; if (!h || h.id !== e.pointerId) return;
    if (h.epoch !== runtime.touchEpoch) { release(); return; }
    look(e.clientX - h.x, e.clientY - h.y); h.x = e.clientX; h.y = e.clientY;
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (hold.current?.id !== e.pointerId) return;
    release(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <button ref={button} type="button" data-hold-control="" aria-label="Hold to fly" title="Release to hover. Drag while held to steer."
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
    onClick={e => { if (e.detail !== 0) return; release(); if (fly()) pulse.current = setTimeout(release, 350); }}>Fly · hold</button>;
}
