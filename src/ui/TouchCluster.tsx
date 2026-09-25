import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { HEAT, pressAim, pressFire, releaseFire, tapShot } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { useGame } from '@/game/store';
import { touchLook } from '@/game/touchLook';
import type { TouchButton, TouchLayout } from '@/game/touchLayout';
import { unlockBlasterAudio } from './audioUnlock';
import { createNudges } from './nudges';
import { ClusterFace, labelShown, markUsed } from './ClusterFace';
import styles from './TouchControls.module.css';
// The right-thumb cluster: real buttons that each own their pointer from touch-down to lift. Every one of them also
// look-drags from the first move, so the right thumb never has to find empty space to aim.
type Props = { layout: TouchLayout; onChange: () => void; onDescend: () => void };
type Hold = { id: number; epoch: number; x: number; y: number; t: number; t0: number; travel: number; dead: boolean };
const ORDER: TouchButton[] = ['descend', 'rise', 'aim', 'fire'];
const AIM_TAP_PX = 12, AIM_TAP_MS = 400, LAND_TAP_MS = 250, NUDGE_MS = 400;
const empty = (): Record<TouchButton, Hold | null> => ({ fire: null, aim: null, rise: null, descend: null });
export default function TouchCluster({ layout, onChange, onDescend }: Props) {
  const flying = useGame(s => s.flying), canLand = useGame(s => s.canLand), nearGround = useGame(s => s.nearGround);
  const blocked = useGame(s => s.descendBlocked) && flying;
  const [latched, setLatched] = useState(false), [, setUses] = useState(0);
  const holds = useRef(empty()), fire = useRef<HTMLButtonElement>(null);
  const [nudges] = useState(() => createNudges((k, v) => { runtime.stick[k] = v; }, k => !!holds.current[k], NUDGE_MS));
  const noteUse = (b: TouchButton) => { if (markUsed(b)) setUses(n => n + 1); };
  const cb = useRef({ onChange, onDescend });
  useEffect(() => { cb.current = { onChange, onDescend }; });
  /** Undo what the press did (never the look it already applied). A dead hold did its release when it died. */
  const release = useCallback((b: TouchButton, h: Hold) => {
    const s = runtime.shooter, st = runtime.stick;
    if (b === 'fire' && s.input.touchId === h.id) { releaseFire(s, 'touch'); s.input.touchId = null; }
    if (b === 'rise') st.rise = 0;
    if (b === 'descend') { st.descend = 0; st.descendUsed = false; }
  }, []);
  const drop = useCallback((b: TouchButton, el: Element | null) => {
    const h = holds.current[b];
    if (!h) return;
    holds.current[b] = null;
    if (!h.dead) release(b, h);
    el?.removeAttribute('data-held');
    cb.current.onChange();
  }, [release]);
  // A button that leaves the layout (blaster off, tap controls on) and unmount both let go of everything they hold.
  useEffect(() => {
    for (const b of ORDER) if (!layout.buttons[b] && holds.current[b]) drop(b, null);
  }, [layout, drop]);
  useEffect(() => () => {
    for (const b of ORDER) drop(b, null);
    nudges.clear();
  }, [drop, nudges]);
  // One loop: Fire's heat ring and overheat lock, written only when they change.
  useEffect(() => {
    let raf = 0, heat = -1, locked: boolean | null = null;
    const tick = () => {
      const w = runtime.shooter.weapon, el = fire.current;
      const h = Math.round(Math.min(1, Math.max(0, w.heat / HEAT.max)) * 100) / 100, l = w.lock > 0;
      if (el && h !== heat) { heat = h; el.style.setProperty('--heat', String(h)); }
      if (el && l !== locked) { locked = l; el.toggleAttribute('data-locked', l); }
      if (!el) { heat = -1; locked = null; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = setInterval(() => setLatched(runtime.shooter.input.aimLatched), 250);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, []);
  const toggleAim = () => {
    const s = runtime.shooter;
    if (!useGame.getState().shooter) return;
    s.input.lookSource = 'touch'; pressAim(s, true); setLatched(s.input.aimLatched);
  };
  const down = (b: TouchButton, e: PointerEvent<HTMLButtonElement>) => {
    if (holds.current[b] || e.pointerType === 'mouse') return;
    const g = useGame.getState(), s = runtime.shooter, st = runtime.stick;
    if (!g.started || g.paused || (b === 'fire' && !g.shooter)) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const now = e.timeStamp;
    holds.current[b] = { id: e.pointerId, epoch: runtime.touchEpoch, x: e.clientX, y: e.clientY, t: now, t0: now, travel: 0, dead: false };
    e.currentTarget.setAttribute('data-held', ''); noteUse(b);
    s.input.lookSource = 'touch';
    if (b === 'fire') { s.input.touchId = e.pointerId; pressFire(s, 'touch'); }
    if (b === 'rise') { st.rise = 1; st.climbs++; if (!g.flying) runtime.lift = true; }
    if (b === 'descend') { st.descend = 1; st.climbs++; st.cruise = false; cb.current.onDescend(); }
    cb.current.onChange();
  };
  /** The press is void once held input was released elsewhere (pause, rotation, blur) or Fire lost its trigger. */
  const alive = (b: TouchButton, h: Hold, el: Element) => {
    if (h.dead) return false;
    const lost = b === 'fire' && runtime.shooter.input.touchId !== h.id;
    if (h.epoch === runtime.touchEpoch && !lost) return true;
    h.dead = true; release(b, h); el.removeAttribute('data-held'); cb.current.onChange();
    return false;
  };
  const move = (b: TouchButton, e: PointerEvent<HTMLButtonElement>) => {
    const h = holds.current[b];
    if (!h || h.id !== e.pointerId || !alive(b, h, e.currentTarget)) return;
    const list = e.nativeEvent.getCoalescedEvents?.() ?? [];
    let path = 0, px = h.x, py = h.y;
    for (const c of list.length ? list : [e.nativeEvent]) { path += Math.hypot(c.clientX - px, c.clientY - py); px = c.clientX; py = c.clientY; }
    const dx = e.clientX - h.x, dy = e.clientY - h.y, dt = Math.max(1, e.timeStamp - h.t);
    h.x = e.clientX; h.y = e.clientY; h.t = e.timeStamp; h.travel += path;
    if (dx || dy) touchLook(dx, dy, path / dt, innerWidth);
  };
  const up = (b: TouchButton, e: PointerEvent<HTMLButtonElement>) => {
    const h = holds.current[b];
    if (!h || h.id !== e.pointerId) return;
    const el = e.currentTarget, live = alive(b, h, el), held = e.timeStamp - h.t0;
    if (live && b === 'aim') {
      const r = el.getBoundingClientRect(), spot = layout.buttons.aim;
      const inside = !!spot && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) <= spot.r;
      if (h.travel <= AIM_TAP_PX && held < AIM_TAP_MS && inside) toggleAim();
    }
    if (live && b === 'descend') {
      const g = useGame.getState();
      if (held < LAND_TAP_MS && g.flying && g.canLand && !g.nearGround) runtime.lift = true;
    }
    drop(b, el);
    unlockBlasterAudio();
  };
  const lost = (b: TouchButton, e: PointerEvent<HTMLButtonElement>) => {
    if (holds.current[b]?.id === e.pointerId) drop(b, e.currentTarget);
  };
  // Keyboard and switch activation (a click with detail 0); touch presses are handled on their pointers above.
  const press = (b: TouchButton) => {
    const g = useGame.getState(), st = runtime.stick;
    if (!g.started || g.paused) return;
    noteUse(b);
    if (b === 'fire' && g.shooter) tapShot(runtime.shooter);
    if (b === 'aim') toggleAim();
    if (b === 'rise') { if (!g.flying) runtime.lift = true; else nudges.pulse('rise'); }
    if (b === 'descend') { if (g.flying && g.canLand) runtime.lift = true; else { st.cruise = false; cb.current.onDescend(); nudges.pulse('descend'); } }
  };
  const label = (b: TouchButton) => b === 'fire' ? 'Fire' : b === 'aim' ? 'Aim'
    : b === 'rise' ? (flying ? 'Rise' : 'Lift off') : (nearGround || canLand ? 'Land' : blocked ? 'No landing' : 'Descend');
  return <>{ORDER.map(b => {
    const spot = layout.buttons[b];
    if (!spot) return null;
    const text = label(b), cue = b === 'descend' && blocked;
    return <button key={b} ref={b === 'fire' ? fire : undefined} type="button" data-hold-control="" data-testid={`${b}-button`}
      aria-label={cue ? 'Descend, no landing here' : text} aria-pressed={b === 'aim' ? latched : undefined} className={`${styles.btn} ${styles[b]}`}
      data-blocked={cue ? '' : undefined}
      style={{ left: spot.x - spot.r, top: spot.y - spot.r, width: spot.r * 2, height: spot.r * 2, ['--vis' as string]: `${spot.visual}px` }}
      onPointerDown={e => down(b, e)} onPointerMove={e => move(b, e)} onPointerUp={e => up(b, e)}
      onPointerCancel={e => lost(b, e)} onLostPointerCapture={e => lost(b, e)}
      onClick={e => { if (e.detail === 0) press(b); }}>
      <ClusterFace b={b} text={text} label={labelShown(b, cue)} />
    </button>;
  })}</>;
}
