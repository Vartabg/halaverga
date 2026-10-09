import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { look, releaseThumb, runtime } from '@/game/runtime';
import { ThumbGate } from '@/game/thumbGate';
import { blastAt, pickAt } from '@/game/gesture/tapFire';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
import { unlockBlasterAudio } from './audioUnlock';
import { markAt } from './gesture/tapMark';
// "One thumb (classic)", the phone default again (Garo 2026-09-26): main 7945430's adaptive thumbs, verbatim. Hold anywhere to
// lift and cruise, slide to aim, drag farther for speed, hold near an edge to keep turning, release to hover; a second contact is
// left move / right look; a third blocks. Shooting sits on top and never enters the flight model: a quick tap (TAP_MS, TAP_SLOP_TOUCH)
// on a drone fires the Lab's aimed burst (tapFire.ts). A second finger is a tap until it holds TAP_MS or
// slides TAP_SLOP_TOUCH: a quick lift blasts while the first thumb flies on untouched; otherwise it joins the thumbs where it is
// (main's move/look handoff, at most 250 ms late). Every second finger is held that way (thumbGate.ts), so a tap that misses a drone
// never stalls the flying thumb. No Fire or Aim button, no auto-fire.
/** Fingers down on the classic surface, across mounts: pause and resume remount the controls (Experience keys them by pause state), so
 *  a finger still down at the next mount is known here and takes a fresh grip on its first move (limits plan S8). Cleared by any lift. */
const held = new Set<number>();
export function useClassicThumbs(surface: RefObject<HTMLDivElement | null>) {
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  // Contacts that were down when held input was released (runtime.touchEpoch moved): the primary one takes a fresh grip on its next
  // move (thumbGate.rearm); any other is ignored until it lifts.
  const epoch = useRef(runtime.touchEpoch), stale = useRef(new Set<number>());
  const syncRef = useRef<() => void>(() => {}), expire = useRef<() => boolean>(() => false);
  const gateRef = useRef<ThumbGate | null>(null);
  gateRef.current ??= new ThumbGate({ expired: () => expire.current(), paused: () => useGame.getState().paused, changed: () => syncRef.current() });
  const gate = gateRef.current, controls = gate.thumbs;
  const sync = () => {
    const c = controls, output = c.output;
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
  syncRef.current = sync;
  /** True when held input was released since the last check: every current contact goes stale until it lifts. */
  const expired = () => {
    if (epoch.current === runtime.touchEpoch) return false;
    epoch.current = runtime.touchEpoch;
    for (const id of controls.contacts.keys()) stale.current.add(id);
    if (gate.pendingId >= 0) stale.current.add(gate.pendingId);
    gate.reset();
    return true;
  };
  expire.current = expired;
  useEffect(() => {
    // A rotation releases held input (useInput's resize handler, registered before this layer mounts, bumps runtime.touchEpoch):
    // expire the contacts in the same event, so the surface reads idle at once as main's remount did, not on the next pointer event.
    const rotated = () => { expire.current(); };
    addEventListener('resize', rotated); screen.orientation?.addEventListener('change', rotated);
    const lifted = (e: globalThis.PointerEvent) => { held.delete(e.pointerId); };
    addEventListener('pointerup', lifted, true); addEventListener('pointercancel', lifted, true);
    return () => {
      removeEventListener('pointerup', lifted, true); removeEventListener('pointercancel', lifted, true);
      removeEventListener('resize', rotated); screen.orientation?.removeEventListener('change', rotated);
      gate.dispose();
      releaseThumb();
    };
  }, [gate]);
  /** The drone under the pointer (blaster on), else -1. Keeps the pick off the flight path with the blaster off. */
  const droneAt = (e: PointerEvent<HTMLDivElement>) => (useGame.getState().shooter ? pickAt(e.clientX, e.clientY, e.timeStamp) : -1);
  const blast = (x: number, y: number, drone: number) => { if (blastAt(x, y, drone)) { markAt(x, y); unlockBlasterAudio(); } };
  const release = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
  const start = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.has(e.pointerId)) return;
    // A stale non-primary contact after cancellation/rotation cannot restart flight.
    if (!controls.contacts.size && !e.isPrimary) return;
    runtime.shooter.input.lookSource = 'touch';
    const drone = droneAt(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    // Another contact settles a pending second finger into a thumb first, so a third finger still blocks the thumbs as on main.
    held.add(e.pointerId);
    gate.down(e.pointerId, e.clientX, e.clientY, e.timeStamp, drone);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    // A finger that outlived a pause, a reset or a rotation: this mount's gate never saw it go down (or expired it). Fresh grip here.
    const outlived = stale.current.delete(e.pointerId) || (held.has(e.pointerId) && !controls.contacts.has(e.pointerId) && !gate.busy);
    if (e.isPrimary && outlived) { runtime.shooter.input.lookSource = 'touch'; gate.rearm(e.pointerId, e.clientX, e.clientY, e.timeStamp); }
    if (!gate.move(e.pointerId, e.clientX, e.clientY, window.innerWidth, window.innerHeight)) return;
    look(controls.output.lookX, controls.output.lookY); sync();
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.delete(e.pointerId)) return;
    const lift = gate.up(e.pointerId, e.clientX, e.clientY, e.timeStamp, window.innerWidth, window.innerHeight);
    if (lift.kind === 'ignored') return;
    release(e);
    if (lift.blast) blast(lift.blast.x, lift.blast.y, lift.blast.drone);
    // A thumb lift is an activation gesture: it is what unlocks blaster audio on a phone.
    unlockBlasterAudio();
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    // Pause unmounts the surface, so the captured pointer is lost while the finger is still down: it keeps its place in `stale` and
    // takes a fresh grip on its next move. A real cancel or lift means the finger is gone.
    if (e.type === 'lostpointercapture' && stale.current.has(e.pointerId)) return;
    if (stale.current.delete(e.pointerId)) return;
    gate.cancel(e.pointerId);
  };
  const busy = () => gate.busy;
  const overlay = <>
    {[0, 1].map(i => <div key={i} ref={node => { markers.current[i] = node; }} hidden className={styles.stick} aria-hidden="true"><span /><small /></div>)}
  </>;
  return { start, move, end, cancel, busy, overlay };
}
