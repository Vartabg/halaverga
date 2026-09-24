import dynamic from 'next/dynamic';
import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { look, releaseThumb, runtime } from '@/game/runtime';
import { AdaptiveThumbs } from '@/game/adaptiveThumbs';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
import { unlockBlasterAudio } from './audioUnlock';
// "One thumb (classic)": the adaptive-thumbs scheme moved here verbatim from TouchControls. Fire and Aim load as their own
// chunk (Experience warms it once the blaster is on); until it arrives nothing is drawn.
const FireControls = dynamic(() => import('./FireControls'), { ssr: false, loading: () => null });
export function useClassicThumbs(surface: RefObject<HTMLDivElement | null>) {
  const controls = useRef(new AdaptiveThumbs()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  // Contacts that were down when held input was released (runtime.touchEpoch moved): ignored until they lift.
  const epoch = useRef(runtime.touchEpoch), stale = useRef(new Set<number>());
  const shooterOn = useGame(s => s.shooter);
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
  /** True when held input was released since the last check: every current contact goes stale until it lifts. */
  const expired = () => {
    if (epoch.current === runtime.touchEpoch) return false;
    epoch.current = runtime.touchEpoch;
    for (const id of controls.current.contacts.keys()) stale.current.add(id);
    clearTimer(); controls.current.cancel(); sync();
    return true;
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    releaseThumb();
  }, []);
  const activate = () => {
    clearTimer();
    if (useGame.getState().paused || expired()) return;
    controls.current.activate(); sync();
  };
  const start = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.has(e.pointerId)) return;
    // A stale non-primary contact after cancellation/rotation cannot restart flight. A held Fire is the first thumb.
    if (!controls.current.contacts.size && !e.isPrimary && runtime.shooter.input.touchId === null) return;
    runtime.shooter.input.lookSource = 'touch';
    clearTimer();
    e.currentTarget.setPointerCapture(e.pointerId);
    controls.current.start(e.pointerId, e.clientX, e.clientY); sync();
    if (controls.current.mode === 'single') timer.current = setTimeout(activate, 180);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (expired()) return;
    const c = controls.current; if (!c.contacts.has(e.pointerId)) return;
    c.move(e.pointerId, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (c.active) clearTimer();
    look(c.output.lookX, c.output.lookY); sync();
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.delete(e.pointerId) || !controls.current.contacts.has(e.pointerId)) return;
    clearTimer(); controls.current.end(e.pointerId); sync();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // A thumb lift is an activation gesture: with auto-fire (no Fire press) it is what unlocks blaster audio.
    unlockBlasterAudio();
  };
  // Fire held: the flight thumb becomes a move stick carrying its cruise throttle, and the Fire drag owns the view.
  const hold = (on: boolean) => {
    controls.current.setExternal(on); sync();
    if (surface.current) surface.current.dataset.fireHeld = String(on);
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.delete(e.pointerId) || !controls.current.contacts.has(e.pointerId)) return;
    clearTimer(); controls.current.cancel(); sync();
  };
  const busy = () => controls.current.contacts.size > 0;
  const overlay = <>
    {[0, 1].map(i => <div key={i} ref={node => { markers.current[i] = node; }} hidden className={styles.stick} aria-hidden="true"><span /><small /></div>)}
    {shooterOn && <FireControls onHold={hold} onRelease={unlockBlasterAudio} />}
  </>;
  return { start, move, end, cancel, busy, overlay };
}
