import { useEffect, useRef } from 'react';
import { look, runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { holdAimed, queueAimedBurst } from '@/game/gesture/aimedShot';
import { clearGesture } from '@/game/gesture/bus';
import { labAimFrame } from '@/game/gesture/screenRay';
import { createStrokeBuffer } from '@/game/gesture/strokeBuffer';
import { classify } from '@/game/gesture/strokeFeatures';
import { pick as pickDrone, tapRay } from '@/game/gesture/tapBlast';
import { BOTTOM_BAND, EDGE_STRIP, INK_WORLD_MS } from '@/game/gesture/tuning';
import type { ArbiterEvent, ArbiterEventType, ArbiterOut, PointerKind, Scheme, StrokeClass, StrokeView } from '@/game/gesture/types';
import { headerBand, readInsets, viewportBox } from '../touchInsets';
import { holdHide, holdRing, holdShow, holdTrack, type HoldModel } from './HoldGuide';
import { InkCanvas } from './InkCanvas';
import { arbiterCommit, arbiterDispatch, arbiterLive, arbiterNeedsTick, arbiterReset, arbiterTracks, createArbiter, type Arbiter,
  type LabId, type StartZone } from './pointerArbiter';
import styles from './Gesture.module.css';
// Gesture Lab surface (spec 2.1): a thin DOM adapter over pointerArbiter. Full screen, touch-action:none, pointer capture, coalesced
// samples for strokes and predicted samples for the ink only. Strokes drive the scheme through the stroke buffer; shots go to
// aimedShot; guide/brake outputs drive the HoldGuide model; the rest go to the scheme's handle() (Conduct) and onAction. Cancel,
// lost capture, blur, hide, pause, epoch change and unmount drop the stroke with no command and clear the bus. It never pauses.

/** A stroke buffer (StrokeBuffer satisfies it): restart for a pointer, append a sample, read as a StrokeView. */
export interface StrokeInput extends StrokeView { begin(id: number, kind: PointerKind, x: number, y: number, t: number): unknown; push(x: number, y: number, t: number): void }
export interface SurfaceHandle { ink: InkCanvas; /** Commit the live stroke or hover ink now (a mid-stroke swipe). */ commitNow(): void }
export interface GestureSurfaceProps {
  scheme: Scheme;
  hold?: HoldModel;
  /** Injectable for tests and tuning; defaults: a StrokeBuffer, strokeFeatures.classify, tapBlast.pick, the store's blaster. */
  stroke?: StrokeInput; classify?(s: StrokeView, scheme: LabId): StrokeClass;
  pick?(x: number, y: number, t: number): number; blaster?(): boolean;
  /** Every output except begin/extend, after the surface handled it. Read it synchronously (the slot is reused). */
  onAction?(out: Readonly<ArbiterOut>, arbiter: Arbiter): void;
  onReady?(handle: SurfaceHandle | null): void;
  /** Screen-ink tail, ms. Default: INK_WORLD_MS in Draw (the world ribbon takes over), the whole stroke otherwise. */
  tailMs?: number;
}
type Extras = { handle?(o: ArbiterOut): boolean; view?: { committed?: boolean } };
const kindOf = (t: string): PointerKind => t === 'mouse' ? 'mouse' : t === 'pen' ? 'pen' : 'touch';
const tagLook = () => { runtime.shooter.input.lookSource = 'tap'; };
const defaultPick = (x: number, y: number, t: number) => pickDrone(x, y, t, runtime.shooter.targets, runtime.shooter.drones.count);
const defaultBlaster = () => useGame.getState().shooter;
const dir = { x: 0, y: 0, z: -1 };
/** Tap to Blast (spec 3.4): the finger aims through the published camera frame; trackAimed re-aims at a picked drone. */
function shoot(o: ArbiterOut) {
  const s = runtime.shooter;
  if (!useGame.getState().shooter) return;
  if (labAimFrame.t > 0) tapRay(labAimFrame, o.x, o.y, dir); else { dir.x = s.aim.dir.x; dir.y = s.aim.dir.y; dir.z = s.aim.dir.z; }
  if (o.type === 'burst' || o.type === 'blastNow') queueAimedBurst(s, dir, o.drone);
  else if (o.type === 'miss') queueAimedBurst(s, dir, -1, 1);
  else holdAimed(s, dir, o.drone, o.type === 'sustainEnd');
}

export default function GestureSurface(props: GestureSurfaceProps) {
  const surface = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), probe = useRef<HTMLDivElement>(null);
  const latest = useRef(props), inkRef = useRef<InkCanvas | null>(null);
  const reduced = useGame(s => s.reduced);
  useEffect(() => {
    latest.current = props;
    const ink = inkRef.current;
    if (ink) { ink.tailMs = props.tailMs ?? (props.scheme.id === 'draw' ? INK_WORLD_MS : Infinity); ink.reduced = reduced; }
  });
  useEffect(() => {
    const el = surface.current, cv = canvas.current;
    if (!el || !cv) return;
    const zone: StartZone = { x: 0, y: 0, width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
    const a = createArbiter({ scheme: latest.current.scheme.id, zone,
      pick: (x, y, t) => (latest.current.pick ?? defaultPick)(x, y, t), blaster: () => (latest.current.blaster ?? defaultBlaster)() });
    const ink = new InkCanvas(cv), buffer = createStrokeBuffer();
    inkRef.current = ink; ink.tailMs = latest.current.tailMs ?? (latest.current.scheme.id === 'draw' ? INK_WORLD_MS : Infinity);
    ink.reduced = useGame.getState().reduced;
    const ev: ArbiterEvent = { type: 'tick', id: -1, x: 0, y: 0, t: 0, kind: 'touch', buttons: 0, epoch: runtime.touchEpoch };
    let epoch = runtime.touchEpoch, raf = 0, routing = false, commitQueued = false, lookX = 0, lookY = 0;
    const measure = () => {
      const box = viewportBox(), ins = readInsets(probe.current);
      zone.x = box.x; zone.y = box.y; zone.width = box.w; zone.height = box.h;
      zone.left = EDGE_STRIP + ins.left; zone.right = EDGE_STRIP + ins.right;
      zone.top = headerBand(box, ins.top); zone.bottom = BOTTOM_BAND + ins.bottom;
    };
    const route = (n: number) => {
      const p = latest.current, s = p.stroke ?? buffer, sc = p.scheme as Scheme & Extras, hold = p.hold;
      routing = true;
      for (let i = 0; i < n; i++) {
        const o = a.out[i], ty = o.type;
        if (ty === 'begin') { s.begin(o.id, ev.kind, o.x, o.y, o.t); sc.down(s); ink.begin(o.x, o.y, o.t); continue; }
        if (ty === 'extend') {
          s.push(o.x, o.y, o.t); sc.move(s); ink.point(o.x, o.y, o.t);
          if (hold?.active) holdTrack(hold, o.x, o.y, s.arc);
          if (sc.view?.committed && arbiterLive(a)) commitQueued = true;
          continue;
        }
        if (ty === 'commit') {
          const c = (p.classify ?? classify)(s, sc.id);
          sc.up(s, c); ink.end(c.kind === 'none' || c.kind === 'nudge' ? 'reject' : 'set'); if (hold) holdHide(hold);
        } else if (ty === 'cancel') { sc.cancel(); ink.cancel(); if (hold) holdHide(hold); }
        else if (ty === 'burst' || ty === 'blastNow' || ty === 'miss' || ty === 'sustain' || ty === 'sustainEnd') {
          shoot(o); ink.ring('arm', o.x, o.y, ty === 'sustain' ? 1 : 0);
        } else if (ty === 'armBlast' || ty === 'disarm') ink.ring('arm', o.x, o.y, ty === 'armBlast' ? 1 : 0);
        else if (ty === 'look') { if (o.progress > 0) look(o.x - lookX, o.y - lookY); lookX = o.x; lookY = o.y; }
        else if (ty === 'guide') {
          if (o.progress > 0) { if (hold) holdShow(hold, sc.id, o.x, o.y); } else { if (hold) holdHide(hold); ink.ring('brake', o.x, o.y, 0); }
        } else if (ty === 'brakeRing') { if (hold) holdRing(hold, o.progress, o.x, o.y); else ink.ring('brake', o.x, o.y, o.progress); } // one ring
        else if (ty === 'brake') { if (hold) holdHide(hold); ink.ring('brake', o.x, o.y, 0); if (!sc.handle?.(o)) sc.fallback('brake'); }
        else sc.handle?.(o);
        p.onAction?.(o, a);
      }
      routing = false;
      if (commitQueued) { commitQueued = false; route(arbiterCommit(a, ev.t)); }
    };
    const feed = (type: ArbiterEventType, id: number, x: number, y: number, t: number, kind: PointerKind, buttons: number) => {
      if (runtime.touchEpoch !== epoch) { epoch = runtime.touchEpoch; clearGesture(); }
      a.cfg.scheme = latest.current.scheme.id;
      ev.type = type; ev.id = id; ev.x = x; ev.y = y; ev.t = t; ev.kind = kind; ev.buttons = buttons; ev.epoch = epoch;
      route(arbiterDispatch(a, ev));
    };
    const tick = () => { raf = 0; feed('tick', -1, ev.x, ev.y, performance.now(), ev.kind, 0); done(); };
    const done = () => { ink.flush(); if (!raf && arbiterNeedsTick(a)) raf = requestAnimationFrame(tick); };
    const resetAll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; commitQueued = false;
      route(arbiterReset(a, performance.now())); clearGesture(); ink.clearRings(); ink.flush();
      const hold = latest.current.hold;
      if (hold) holdHide(hold);
    };
    const down = (e: PointerEvent) => {
      tagLook();
      if (e.button !== 0 || (e.ctrlKey && e.pointerType === 'mouse')) return; // right- or ctrl-click arrives as contextmenu (escape)
      try { el.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      feed('down', e.pointerId, e.clientX, e.clientY, e.timeStamp, kindOf(e.pointerType), e.buttons); done();
    };
    const move = (e: PointerEvent) => {
      tagLook();
      const kind = kindOf(e.pointerType), list = e.getCoalescedEvents?.();
      if (list && list.length) for (let i = 0; i < list.length; i++) feed('move', e.pointerId, list[i].clientX, list[i].clientY, list[i].timeStamp, kind, e.buttons);
      else feed('move', e.pointerId, e.clientX, e.clientY, e.timeStamp, kind, e.buttons);
      if (arbiterLive(a)) {
        const pred = e.getPredictedEvents?.();
        if (pred) for (let i = 0; i < pred.length; i++) ink.predict(pred[i].clientX, pred[i].clientY);
      } else if (kind === 'mouse' && e.buttons === 0 && !arbiterTracks(a, e.pointerId)) latest.current.scheme.hover?.(e.clientX, e.clientY, e.timeStamp);
      done();
    };
    const up = (e: PointerEvent) => { feed('up', e.pointerId, e.clientX, e.clientY, e.timeStamp, kindOf(e.pointerType), e.buttons); done(); };
    // Lost capture also follows every normal up; only a pointer the arbiter still tracks is a real cancel.
    const cancel = (e: PointerEvent) => {
      if (!arbiterTracks(a, e.pointerId)) return;
      feed('cancel', e.pointerId, e.clientX, e.clientY, e.timeStamp, kindOf(e.pointerType), 0); clearGesture(); done();
    };
    const context = (e: MouseEvent) => { e.preventDefault(); feed('escape', -1, e.clientX, e.clientY, e.timeStamp, 'mouse', 0); done(); };
    // Escape cancels live ink or a stroke; with nothing live it passes through, so Escape still pauses.
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || !arbiterLive(a)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      feed('escape', -1, ev.x, ev.y, performance.now(), 'mouse', 0); done();
    };
    const hidden = () => { if (document.visibilityState === 'hidden') resetAll(); };
    const unsubscribe = useGame.subscribe((s, prev) => { if (s.paused && !prev.paused) resetAll(); });
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* no pointer lock to leave */ }
    measure();
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel); el.addEventListener('lostpointercapture', cancel); el.addEventListener('contextmenu', context);
    window.addEventListener('keydown', key, true); window.addEventListener('blur', resetAll); window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure); document.addEventListener('visibilitychange', hidden);
    latest.current.onReady?.({ ink, commitNow: () => { if (routing) commitQueued = true; else { route(arbiterCommit(a, performance.now())); done(); } } });
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel); el.removeEventListener('lostpointercapture', cancel); el.removeEventListener('contextmenu', context);
      window.removeEventListener('keydown', key, true); window.removeEventListener('blur', resetAll); window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure); document.removeEventListener('visibilitychange', hidden);
      unsubscribe(); resetAll(); latest.current.onReady?.(null); ink.destroy(); inkRef.current = null;
    };
  }, []);
  return <>
    <div ref={surface} className={styles.surface} aria-hidden="true" data-play-surface="" data-gesture-surface="" data-testid="lab-surface" />
    <canvas ref={canvas} className={styles.ink} aria-hidden="true" />
    <div ref={probe} className={styles.probe} aria-hidden="true" />
  </>;
}
