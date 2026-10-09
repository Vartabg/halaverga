import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { look, releaseThumb, runtime } from '@/game/runtime';
import { AdaptiveThumbs } from '@/game/adaptiveThumbs';
import { blastAt, pickAt } from '@/game/gesture/tapFire';
import { TAP_MS, TAP_SLOP_TOUCH } from '@/game/gesture/tuning';
import { useGame } from '@/game/store';
import styles from './Experience.module.css';
import { unlockBlasterAudio } from './audioUnlock';
import { markAt } from './gesture/tapMark';
// "One thumb (classic)", the phone default again (Garo 2026-09-26): main 7945430's adaptive thumbs, verbatim. Hold anywhere to
// lift and cruise, slide to aim, drag farther for speed, hold near an edge to keep turning, release to hover; a second contact is
// left move / right look; a third blocks. Shooting sits on top and never enters the flight model: a quick tap (TAP_MS, TAP_SLOP_TOUCH)
// on a drone fires the Lab's aimed burst (tapFire.ts). A second finger that lands on a drone is a tap until it holds TAP_MS or
// slides TAP_SLOP_TOUCH: a quick lift blasts while the first thumb flies on untouched; otherwise it joins the thumbs where it is
// (main's move/look handoff, at most 250 ms late). A tap on empty space does what main did: nothing. No Fire or Aim button, no auto-fire.
/** Hold this long to lift (main's 180 ms); a hold that landed on a drone waits TAP_MS, so a quick tap there blasts without lifting. */
const HOLD_MS = 180;
type Tap = { x: number; y: number; t: number; drone: number };
/** A second contact that landed on a drone and has not yet decided between a tap and a thumb. */
type Pending = Tap & { id: number; timer: ReturnType<typeof setTimeout> };
export function useClassicThumbs(surface: RefObject<HTMLDivElement | null>) {
  const controls = useRef(new AdaptiveThumbs()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  // Contacts that were down when held input was released (runtime.touchEpoch moved): ignored until they lift.
  const epoch = useRef(runtime.touchEpoch), stale = useRef(new Set<number>());
  // taps: where and when each flight contact landed and the drone under it; pending: the undecided second finger on a drone.
  const taps = useRef(new Map<number, Tap>()), pending = useRef<Pending | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const clearPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
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
    if (pending.current) stale.current.add(pending.current.id);
    clearPending(); clearTimer(); controls.current.cancel(); taps.current.clear(); sync();
    return true;
  };
  /** The pending second finger becomes a thumb where it is (AdaptiveThumbs.start: dual, or blocked with a third), with no blast. */
  const join = () => {
    const p = pending.current; if (!p) return;
    clearPending(); clearTimer();
    controls.current.start(p.id, p.x, p.y); sync();
  };
  const expire = useRef(expired); expire.current = expired;
  useEffect(() => {
    // A rotation releases held input (useInput's resize handler, registered before this layer mounts, bumps runtime.touchEpoch):
    // expire the contacts in the same event, so the surface reads idle at once as main's remount did, not on the next pointer event.
    const rotated = () => { expire.current(); };
    addEventListener('resize', rotated); screen.orientation?.addEventListener('change', rotated);
    return () => {
      removeEventListener('resize', rotated); screen.orientation?.removeEventListener('change', rotated);
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) clearTimeout(pending.current.timer);
      releaseThumb();
    };
  }, []);
  const activate = () => {
    clearTimer();
    if (useGame.getState().paused || expired()) return;
    controls.current.activate(); sync();
  };
  /** The drone under the pointer (blaster on), else -1. Keeps the pick off the flight path with the blaster off. */
  const droneAt = (e: PointerEvent<HTMLDivElement>) => (useGame.getState().shooter ? pickAt(e.clientX, e.clientY, e.timeStamp) : -1);
  const blast = (x: number, y: number, drone: number) => { if (blastAt(x, y, drone)) { markAt(x, y); unlockBlasterAudio(); } };
  const start = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.has(e.pointerId)) return;
    // A stale non-primary contact after cancellation/rotation cannot restart flight.
    if (!controls.current.contacts.size && !e.isPrimary) return;
    runtime.shooter.input.lookSource = 'touch';
    const drone = droneAt(e);
    // Another contact settles a pending second finger into a thumb first, so a third finger still blocks the thumbs as on main.
    join();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (controls.current.contacts.size === 1 && drone >= 0) {
      pending.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, drone, timer: setTimeout(() => { if (!expired()) join(); }, TAP_MS) };
      return;
    }
    clearTimer();
    controls.current.start(e.pointerId, e.clientX, e.clientY); sync();
    taps.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, drone });
    if (controls.current.mode === 'single') timer.current = setTimeout(activate, drone >= 0 ? TAP_MS : HOLD_MS);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (expired()) return;
    const p = pending.current;
    if (p && p.id === e.pointerId) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_SLOP_TOUCH) return;
      p.x = e.clientX; p.y = e.clientY; join(); // slid past the tap slop: a thumb from here on
    }
    const c = controls.current; if (!c.contacts.has(e.pointerId)) return;
    c.move(e.pointerId, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (c.active) clearTimer();
    look(c.output.lookX, c.output.lookY); sync();
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.delete(e.pointerId)) return;
    const p = pending.current;
    if (p && p.id === e.pointerId) {
      // Still pending at the lift (within TAP_MS and TAP_SLOP_TOUCH): a quick second-finger tap on a drone. The thumbs never saw it.
      clearPending();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      blast(e.clientX, e.clientY, p.drone); unlockBlasterAudio();
      return;
    }
    const c = controls.current; if (!c.contacts.has(e.pointerId)) return;
    const tap = taps.current.get(e.pointerId); taps.current.delete(e.pointerId);
    // A quick tap on a drone (never lifted, still, within TAP_MS) blasts it; a quick tap anywhere else does nothing, as on main.
    const quick = !!tap && c.mode === 'single' && !c.active && tap.drone >= 0
      && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP_TOUCH && e.timeStamp - tap.t <= TAP_MS;
    // The flight thumb lifts under a pending second finger: that finger joins first, then stays as main's re-based, inactive single.
    join();
    clearTimer(); c.end(e.pointerId); sync();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (quick) blast(e.clientX, e.clientY, tap.drone);
    // A thumb lift is an activation gesture: it is what unlocks blaster audio on a phone.
    unlockBlasterAudio();
  };
  const cancel = (e: PointerEvent<HTMLDivElement>) => {
    expired();
    if (stale.current.delete(e.pointerId)) return;
    if (pending.current?.id === e.pointerId) { clearPending(); return; }
    if (!controls.current.contacts.has(e.pointerId)) return;
    clearTimer(); clearPending(); controls.current.cancel(); taps.current.clear(); sync();
  };
  const busy = () => controls.current.contacts.size > 0 || pending.current !== null;
  const overlay = <>
    {[0, 1].map(i => <div key={i} ref={node => { markers.current[i] = node; }} hidden className={styles.stick} aria-hidden="true"><span /><small /></div>)}
  </>;
  return { start, move, end, cancel, busy, overlay };
}
