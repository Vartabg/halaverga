import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { computeLayout, routeTouch, type TouchLayout } from '@/game/touchLayout';
import { createStick, knobOffset, stickCancel, stickDown, stickMove, stickTick, stickUp } from '@/game/twinStick';
import { touchLook } from '@/game/touchLook';
import { headerBand, readInsets, viewportBox, type ViewBox } from './touchInsets';
import { unlockBlasterAudio } from './audioUnlock';
import type { OverlayProps, TwinRefs } from './TwinStickOverlay';
// Twin-stick touch: a touch's role is fixed at touch-down. In the stick zone it is the floating move stick; anywhere else inside
// the bands it looks (1:1, relative). Buttons own their own pointers (TouchCluster). One owner per pointerId for its whole life;
// a contact that was down when held input was released (runtime.touchEpoch moved) is dead until it lifts.
type Contact = { role: 'stick' | 'look'; epoch: number; ox: number; oy: number; lastX: number; lastY: number; lastT: number; dead: boolean };
type View = { box: ViewBox; layout: TouchLayout };
const prefsChanged = (a: ReturnType<typeof useGame.getState>, b: ReturnType<typeof useGame.getState>) =>
  a.controlSize !== b.controlSize || a.flipSides !== b.flipSides || a.shooter !== b.shooter || a.aimButton !== b.aimButton || a.tapControls !== b.tapControls;
export function useTwinStick(surface: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null), probeEl = useRef<HTMLDivElement | null>(null), frame = useRef(0);
  const stick = useRef(createStick()), contacts = useRef(new Map<number, Contact>()), epoch = useRef(runtime.touchEpoch);
  const ring = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null), ghost = useRef<HTMLDivElement>(null);
  const cues = useRef<HTMLDivElement>(null), boost = useRef<HTMLSpanElement>(null), cruise = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const refs: TwinRefs = { ring, knob, ghost, cues, boost, cruise, layer };
  const opacity = useGame(s => s.controlOpacity), reduced = useGame(s => s.reduced);
  const measure = useCallback((): View | null => {
    frame.current = 0;
    const box = viewportBox();
    if (!(box.w > 0 && box.h > 0)) return viewRef.current;
    const insets = readInsets(probeEl.current), g = useGame.getState();
    const layout = computeLayout(box.w, box.h, insets, headerBand(box, insets.top), { size: g.controlSize, flip: g.flipSides,
      fire: g.shooter, aim: g.shooter && g.aimButton && !g.tapControls, tapPad: g.tapControls });
    const next = { box, layout };
    viewRef.current = next; setView(next);
    if (surface.current) surface.current.dataset.layout = layout.variant;
    return next;
  }, [surface]);
  // Coalesced to one frame; a recompute never touches contacts (a held stick keeps its own touch-down origin).
  const schedule = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(() => { measure(); }); }, [measure]);
  const probe = useCallback((node: HTMLDivElement | null) => { probeEl.current = node; if (node) schedule(); }, [schedule]);
  const writeStick = useCallback(() => {
    const st = runtime.stick, s = stick.current, active = (s.id !== null && s.out > 0) || s.cruise;
    st.forward = s.forward; st.strafe = s.strafe; st.boost = s.boost; st.cruise = s.cruise;
    if (active && !st.active) st.moves++;
    st.active = active;
  }, []);
  const paint = useCallback(() => {
    const s = stick.current, held = s.id !== null, v = viewRef.current, el = surface.current;
    let look = runtime.shooter.input.touchId !== null && runtime.shooter.input.fireSource === 'touch';
    for (const c of contacts.current.values()) if (c.role === 'look' && !c.dead) look = true;
    if (el) {
      el.dataset.controlMode = held && look ? 'dual' : held ? 'move' : look ? 'look' : 'idle';
      el.dataset.fireHeld = String(runtime.shooter.input.touchId !== null && runtime.shooter.input.fireSource === 'touch');
      el.dataset.boost = String(s.boost); el.dataset.cruise = String(s.cruise);
    }
    if (ring.current) {
      ring.current.hidden = !held; ring.current.dataset.boost = String(s.boost);
      if (held) ring.current.style.transform = `translate(${s.baseX - s.R - 8}px, ${s.baseY - s.R - 8}px)`;
    }
    if (knob.current) { const k = knobOffset(s); knob.current.style.transform = `translate(${k.x}px, ${k.y}px)`; }
    if (ghost.current) ghost.current.hidden = held || !v?.layout.ghost;
    const anchor = held ? { x: s.baseX, y: s.baseY } : v?.layout.ghost;
    if (cues.current) {
      cues.current.hidden = !anchor || !(s.boost || s.cruise);
      if (anchor && v) cues.current.style.transform = `translate(calc(${anchor.x}px - 50%), calc(${anchor.y - v.layout.R - 12}px - 100%))`;
    }
    if (boost.current) boost.current.hidden = !s.boost;
    if (cruise.current) cruise.current.hidden = !s.cruise;
  }, [surface]);
  /** Held input was released elsewhere since the last look: every current contact dies until it lifts. */
  const sweep = useCallback(() => {
    if (epoch.current === runtime.touchEpoch) return false;
    epoch.current = runtime.touchEpoch;
    for (const c of contacts.current.values()) c.dead = true;
    stickCancel(stick.current); writeStick(); paint();
    return true;
  }, [writeStick, paint]);
  const drop = useCallback(() => {
    contacts.current.clear(); stickCancel(stick.current); writeStick(); paint();
  }, [writeStick, paint]);
  useEffect(() => {
    if (!enabled) return;
    schedule();
    const vv = window.visualViewport, orientation = typeof screen === 'undefined' ? undefined : screen.orientation;
    addEventListener('resize', schedule); vv?.addEventListener('resize', schedule); vv?.addEventListener('scroll', schedule);
    orientation?.addEventListener?.('change', schedule);
    const unsubscribe = useGame.subscribe((s, p) => {
      if (prefsChanged(s, p)) schedule();
      if (s.paused && !p.paused) drop(); // the surface unmounts while paused, so its fingers can never report a lift
    });
    let raf = 0;
    const loop = (now: number) => {
      sweep();
      const s = stick.current, was = s.boost;
      if (s.id !== null) { stickTick(s, now); if (s.boost !== was) { writeStick(); paint(); } }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      removeEventListener('resize', schedule); vv?.removeEventListener('resize', schedule); vv?.removeEventListener('scroll', schedule);
      orientation?.removeEventListener?.('change', schedule);
      unsubscribe(); cancelAnimationFrame(raf); cancelAnimationFrame(frame.current); frame.current = 0;
    };
  }, [enabled, schedule, sweep, drop, writeStick, paint]);
  useEffect(() => () => { stickCancel(stick.current); writeStick(); }, [writeStick]);
  const start = (e: PointerEvent<HTMLDivElement>) => {
    sweep();
    const v = viewRef.current ?? measure();
    if (!v || contacts.current.has(e.pointerId)) return;
    const route = routeTouch(v.layout, e.clientX - v.box.x, e.clientY - v.box.y);
    let role: Contact['role'];
    if (route.kind === 'stick') {
      if (stick.current.id !== null || !v.layout.stickZone) return;
      role = 'stick';
    } else if (route.kind === 'look') {
      for (const c of contacts.current.values()) if (c.role === 'look' && !c.dead) return;
      role = 'look';
    } else return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    contacts.current.set(e.pointerId, { role, epoch: runtime.touchEpoch, ox: v.box.x, oy: v.box.y,
      lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, dead: false });
    if (role === 'stick') {
      stickDown(stick.current, e.pointerId, e.clientX - v.box.x, e.clientY - v.box.y, e.timeStamp, v.layout.R, v.layout.stickZone!, useGame.getState().flying);
      writeStick();
    }
    runtime.shooter.input.lookSource = 'touch';
    paint();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    sweep();
    const c = contacts.current.get(e.pointerId);
    if (!c || c.dead) return;
    if (c.role === 'stick') {
      stickMove(stick.current, e.pointerId, e.clientX - c.ox, e.clientY - c.oy, e.timeStamp);
      writeStick(); paint();
    } else {
      const list = e.nativeEvent.getCoalescedEvents?.() ?? [];
      let path = 0, px = c.lastX, py = c.lastY;
      for (const p of list.length ? list : [e.nativeEvent]) { path += Math.hypot(p.clientX - px, p.clientY - py); px = p.clientX; py = p.clientY; }
      const dx = e.clientX - c.lastX, dy = e.clientY - c.lastY, dt = Math.max(1, e.timeStamp - c.lastT);
      if (dx || dy) touchLook(dx, dy, path / dt);
    }
    c.lastX = e.clientX; c.lastY = e.clientY; c.lastT = e.timeStamp;
  };
  const finish = (e: PointerEvent<HTMLDivElement>, lifted: boolean) => {
    sweep();
    const c = contacts.current.get(e.pointerId);
    if (!c) return;
    contacts.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!c.dead && c.role === 'stick') {
      if (lifted) stickUp(stick.current, e.pointerId, e.timeStamp, useGame.getState().flying);
      else stickCancel(stick.current);
      writeStick();
    }
    paint();
    if (lifted) unlockBlasterAudio();
  };
  const cancelCruise = useCallback(() => {
    const s = stick.current;
    if (!s.cruise) return;
    s.cruise = false;
    if (!(s.id !== null && s.out > 0)) { s.forward = 0; s.strafe = 0; }
    writeStick(); paint();
  }, [writeStick, paint]);
  const busy = () => contacts.current.size > 0;
  const overlay: OverlayProps = { view: enabled ? view : null, probe, refs, opacity, reduced };
  return { start, move, end: (e: PointerEvent<HTMLDivElement>) => finish(e, true), cancel: (e: PointerEvent<HTMLDivElement>) => finish(e, false),
    busy, overlay, sync: paint, cancelCruise };
}
