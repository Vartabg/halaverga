'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HEAT, readEvents, type ShotEvent } from '@/game/combat';
import { runtime } from '@/game/runtime';
import { lastShotIndex } from '@/game/burst';
import { guarded } from '@/game/shooterFault';
import { cannonLink } from '@/world/cannonContract';
import { useGame } from '@/game/store';
import { MARKER_T, chainLabel, crossScale, crosshairRadius, heatColor, markerState, pipAngle, ventState, type Marker, type MarkerKind } from './hudTimeline';
import ControlsHint from './ControlsHint';
import styles from './ShooterHud.module.css';
// Per-frame values go straight from runtime.shooter to element styles through refs: no React state per frame and no render
// invalidation. The only state is the kill announcement, in a live region kept outside the aria-hidden visual root.
const C = 2 * Math.PI * 22, ARC = C * .75, TELEGRAPH_T = .35, SAY_MS = 2000;
const VENT = ventState(0, HEAT.lock, HEAT.ventAt, HEAT.ventHalf);
const WINDOW_DASH = `0 ${VENT.windowStart01 * ARC} ${(VENT.windowEnd01 - VENT.windowStart01) * ARC} ${C}`;
const angle = (deg: number) => ({ '--a': deg + 'deg' }) as CSSProperties;
const TICKS = [0, 90, 180, 270].map(angle), XTICKS = [45, 135, 225, 315].map(angle);
const ios = () => /iPhone|iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
// Once per page load: each sound nudge.
let mutedNudged = false, silentNudged = false;
function nudge() {
  const muted = useGame.getState().muted;
  if (muted && !mutedNudged) { mutedNudged = true; useGame.setState({ message: 'Blaster sound is off · Settings' }); }
  else if (!muted && !silentNudged && ios() && !('audioSession' in navigator)) {
    silentNudged = true; useGame.setState({ message: 'No blaster sound? Check the silent switch.' });
  }
}
const isMarker = (k: ShotEvent['kind']): k is MarkerKind => k === 'hit' || k === 'weak' || k === 'kill' || k === 'blocked';

export default function ShooterHud() {
  const root = useRef<HTMLDivElement>(null), cross = useRef<HTMLDivElement>(null), heat = useRef<SVGSVGElement>(null),
    fill = useRef<SVGCircleElement>(null), vent = useRef<SVGGElement>(null), sweep = useRef<SVGCircleElement>(null),
    marker = useRef<HTMLSpanElement>(null), chev = useRef<HTMLSpanElement>(null), chain = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState('');
  const desktopMode = useGame(s => s.desktopMode), steering = useGame(s => s.trackpadSteering), tapControls = useGame(s => s.tapControls), aimToggle = useGame(s => s.aimToggle);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  useEffect(() => {
    const el = root.current!, crossEl = cross.current!, heatEl = heat.current!, fillEl = fill.current!, ventEl = vent.current!,
      sweepEl = sweep.current!, markEl = marker.current!, chevEl = chev.current!, chainEl = chain.current!;
    const s = runtime.shooter, cursor = { last: s.eventSerial }, m: Marker = { visible: false, scale: 1, opacity: 0, rotate: 0 },
      v = ventState(0, HEAT.lock, HEAT.ventAt, HEAT.ventHalf);
    let kind: MarkerKind | null = null, kindT = 0, pipT = -1, pendingKill = false, lastSay = -Infinity, says = 0, shotsSeen = s.stats.shots;
    let lr = -1, lpop = -1, lacq = false, lblocked = false, lheat = false, lfill = -1, lcolor = '', llock = false, lsweep = -1, lin = false,
      lchain = 0;
    const onEvent = (e: ShotEvent) => {
      if (isMarker(e.kind)) {
        // The X ticks already sit on the diagonals, off the crosshair's axes: the kill marker is not rotated further.
        if (e.kind !== kind) markEl.dataset.kind = e.kind;
        kind = e.kind; kindT = e.t; if (e.kind === 'kill') pendingKill = true;
      } else if (e.kind === 'telegraph') {
        const a = s.aim, x = e.from.x - a.origin.x, y = e.from.y - a.origin.y, z = e.from.z - a.origin.z;
        el.style.setProperty('--pip', pipAngle(x * a.right.x + y * a.right.y + z * a.right.z, x * a.up.x + y * a.up.y + z * a.up.z) + 'rad');
        pipT = e.t;
      }
    };
    const body = guarded<number, number>('hud', (now: number) => {
      const a = s.aim, w = s.weapon, st = s.stats, reduced = useGame.getState().reduced;
      readEvents(s, cursor, onEvent);
      const r = Math.round(crosshairRadius(a.spreadHalf, a.fov, innerHeight, a.acquired) * 10) / 10;
      if (r !== lr) { lr = r; el.style.setProperty('--r', r + 'px'); }
      const pop = crossScale(w.sinceShot, reduced, lastShotIndex());
      if (pop !== lpop) { lpop = pop; crossEl.style.scale = String(pop); }
      if (a.acquired !== lacq) { lacq = a.acquired; crossEl.dataset.acquired = String(lacq); }
      if (a.blocked !== lblocked) { lblocked = a.blocked; crossEl.dataset.blocked = String(lblocked); }
      const locked = w.lock > 0, h = Math.min(1, Math.max(0, w.heat / HEAT.max)), on = h > 0 || locked;
      if (on !== lheat) { lheat = on; heatEl.style.opacity = on ? '1' : '0'; }
      const f = Math.round(h * ARC * 10) / 10;
      if (f !== lfill) { lfill = f; fillEl.setAttribute('stroke-dasharray', f + ' ' + C); }
      const color = locked ? '#ff5a36' : heatColor(h);
      if (color !== lcolor) { lcolor = color; fillEl.setAttribute('stroke', color); }
      if (locked !== llock) { llock = locked; ventEl.style.opacity = locked ? '1' : '0'; }
      if (locked) {
        ventState(w.lockT, HEAT.lock, HEAT.ventAt, HEAT.ventHalf, v);
        const sw = Math.round(v.sweep01 * ARC * 10) / 10;
        if (sw !== lsweep) { lsweep = sw; sweepEl.setAttribute('stroke-dasharray', `0 ${Math.max(0, sw - 1)} 2 ${C}`); }
        if (v.inWindow !== lin) { lin = v.inWindow; ventEl.dataset.open = String(lin); }
      }
      if (kind) {
        markerState(kind, s.clock - kindT, reduced, m);
        markEl.style.opacity = String(m.opacity); markEl.style.scale = String(m.scale);
        if (!m.visible) kind = null;
      }
      if (pipT >= 0) {
        const age = s.clock - pipT;
        chevEl.style.opacity = age < TELEGRAPH_T ? String(markerState('hit', age * MARKER_T / TELEGRAPH_T, reduced, m).opacity) : '0';
        if (!(age < TELEGRAPH_T)) pipT = -1;
      }
      const since = s.clock - st.lastKillT, shown = st.chain >= 2 && since <= 1.2 ? st.chain : 0;
      if (shown !== lchain) { lchain = shown; chainEl.textContent = chainLabel(st.chain, since); }
      if (pendingKill && now - lastSay >= SAY_MS) {
        pendingKill = false; lastSay = now; says++;
        // Alternating a trailing no-break space changes the text node, so a repeated phrase is announced again.
        setLive('Drone down' + (st.chain >= 2 ? ', chain ' + st.chain : '') + (says % 2 ? '' : '\u00a0'));
      }
      if (st.shots !== shotsSeen) { if (st.shots > shotsSeen && !(mutedNudged && silentNudged)) nudge(); shotsSeen = st.shots; }
    });
    let raf = 0;
    const frame = (now: number) => { raf = requestAnimationFrame(frame); body(now, 0); };
    raf = requestAnimationFrame(frame);
    const stamp = () => {
      const d = el.dataset, st = s.stats, a = s.aim, w = s.weapon;
      d.shots = String(st.shots); d.hits = String(st.hits); d.kills = String(st.kills); d.aiming = String(a.blend > .5);
      d.heat = String(Math.round(w.heat / HEAT.max * 100)); d.locked = String(w.lock > 0); d.acquired = String(a.acquired); d.fov = a.fov.toFixed(1);
      // The arm cannon for the browser specs: none, ready (parented, hand still shown) or shown (hand hidden, cannon drawn).
      d.cannon = cannonLink.ready ? cannonLink.handHidden ? 'shown' : 'ready' : 'none';
    };
    stamp();
    const timer = setInterval(stamp, 100);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  }, []);
  return <>
    <div ref={root} className={styles.hud} aria-hidden="true" data-testid="shooter-hud">
      <svg ref={heat} className={styles.heat} viewBox="0 0 50 50" style={{ opacity: 0 }}>
        <g transform="rotate(135 25 25)" fill="none" strokeWidth="1.5">
          <circle className={styles.track} cx="25" cy="25" r="22" strokeDasharray={`${ARC} ${C}`} />
          <circle ref={fill} cx="25" cy="25" r="22" stroke="#58e1ff" strokeDasharray={`0 ${C}`} />
          <g ref={vent} className={styles.vent} style={{ opacity: 0 }}>
            <circle className={styles.window} cx="25" cy="25" r="22" strokeDasharray={WINDOW_DASH} />
            <circle ref={sweep} className={styles.sweep} cx="25" cy="25" r="22" strokeWidth="2.5" strokeDasharray={`0 ${C}`} />
          </g>
        </g>
      </svg>
      <div ref={cross} className={styles.cross}>
        <span className={styles.dot} /><span className={styles.blocked}><i /><i /></span>
        {TICKS.map((t, k) => <span key={k} className={styles.tick} style={t} />)}
      </div>
      <span ref={marker} className={styles.marker} style={{ opacity: 0 }}>
        {XTICKS.map((t, k) => <i key={k} style={t} />)}<b />
      </span>
      <span ref={chev} className={styles.chev} style={{ opacity: 0 }}><i /></span>
      <span ref={chain} className={styles.chain} />
    </div>
    <div className="sr-only" aria-live="polite" data-testid="shooter-live">{live}</div>
    {/* Outside the crosshair box. */}
    <ControlsHint coarse={coarse} desktopMode={desktopMode} steering={steering} tapControls={tapControls} aimToggle={aimToggle} />
  </>;
}
