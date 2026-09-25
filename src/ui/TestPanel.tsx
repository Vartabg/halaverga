import dynamic from 'next/dynamic';
import { Fragment, useEffect, useRef, useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import Modal from './Modal';
import styles from './Experience.module.css';
import TrackpadSettings from './TrackpadSettings';
import MoreControls from './MoreControls';
import TouchSettings from './TouchSettings';
import { touchMode } from '@/game/pointerMode';
import { readInsets } from './touchInsets';
import { isStandalone } from './playSession';
import { unlockBlasterAudio } from './audioUnlock';
import LabPanel, { LabStatsTable } from './gesture/LabPanel';
// Blaster settings load with the panel, not with the landing page.
const ShooterSettings = dynamic(() => import('./ShooterSettings'), { ssr: false, loading: () => null });
import { BUILD_STAMP, DEPLOYMENT_URL } from './buildInfo';
function measurements() {
  const frames = [...runtime.frames].sort((a, b) => a - b);
  const percentile = (p: number) => frames.length ? Math.round(frames[Math.floor((frames.length - 1) * p)] * 10) / 10 : 0;
  return { seconds: Math.round(runtime.elapsed), samples: frames.length, p50Ms: percentile(.5), p95Ms: percentile(.95),
    stallsOver50Ms: frames.filter(v => v > 50).length, browser: navigator.userAgent,
    viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, quality: useGame.getState().quality,
    camera: useGame.getState().camera, resources: runtime.resources, peakResources: runtime.peakResources,
    build: BUILD_STAMP, deployment: DEPLOYMENT_URL,
    scope: 'Latest 18,000 active frames; first resume frame excluded. Resource peaks cover the session.' };
}
// Screen diagnostics (Flight settings, coarse pointers only): plain values Garo can read on his iPhone, so the touch layout's
// inputs (visual viewport, zoom, safe-area insets, Home Screen mode) are checked on the real device, not guessed from emulation.
// Read once when opened and on Refresh; nothing polls.
type Reading = [label: string, value: string][];
const r1 = (n: number) => String(Math.round(n * 10) / 10);
function read(probe: HTMLElement | null): Reading {
  const vv = window.visualViewport, i = readInsets(probe);
  return [
    ['Inner size', `${innerWidth} × ${innerHeight}`],
    ['Visual size', vv ? `${r1(vv.width)} × ${r1(vv.height)}` : 'not available'],
    ['Scale', vv ? String(Math.round(vv.scale * 1000) / 1000) : 'not available'],
    ['Offset top', vv ? r1(vv.offsetTop) : 'not available'],
    ['Safe insets t/r/b/l', `${r1(i.top)} / ${r1(i.right)} / ${r1(i.bottom)} / ${r1(i.left)}`],
    ['Home Screen app', isStandalone() ? 'yes' : 'no'],
    ['Touch mode', touchMode() ? 'yes' : 'no'],
  ];
}
const PROBE = { position: 'fixed', inset: 0, visibility: 'hidden', pointerEvents: 'none',
  padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' } as const;

function ScreenDiagnostics() {
  const probe = useRef<HTMLDivElement>(null), [rows, setRows] = useState<Reading | null>(null);
  const refresh = () => setRows(read(probe.current));
  return <details data-testid="screen-diagnostics" onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open && !rows) refresh(); }}>
    <summary>Screen diagnostics</summary>
    <div ref={probe} aria-hidden="true" style={PROBE} />
    <p>Values from this screen, for checking the touch layout on a real phone. Sizes are CSS pixels.</p>
    {rows && <dl className={styles.stats}>{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>}
    <button className={styles.secondary} onClick={refresh}>Refresh</button>
  </details>;
}

export default function TestPanel({ onClose }: { onClose: () => void }) {
  const state = useGame(), [stats, setStats] = useState<ReturnType<typeof measurements> | null>(null);
  // Touch screens: the blaster section (Auto-fire) leads, above the control lab and the desktop and trackpad sections, so it is not
  // below the fold (852 × 393 landscape included).
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  // Any touch screen (a phone, or an iPad or laptop that also has a trackpad) gets the touch controls, blaster on or off.
  const [anyCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches);
  useEffect(() => { setStats(measurements()); }, []);
  const save = (patch: Parameters<typeof state.set>[0]) => { state.set(patch); persistGame(); };
  return <Modal title="Flight settings" onClose={onClose}>
    <p>Adjust the experience, resume, and try the same route again.</p>
    {!coarse && <LabPanel />}
    {coarse && <ShooterSettings coarse />}
    {coarse && <TouchSettings />}
    {/* Touch: the control lab follows the blaster and touch sections, so Auto-fire stays above the fold in landscape too. The
        pause card and the Lab chip keep the switch one tap away while playing. */}
    {coarse && <LabPanel />}
    <fieldset><legend>Perspective</legend><div className={styles.segment}>
      <button aria-pressed={state.camera === 'third'} onClick={() => save({ camera: 'third' })}>Third person</button>
      <button aria-pressed={state.camera === 'first'} onClick={() => save({ camera: 'first' })}>First person</button>
    </div></fieldset>
    <label className={styles.setting}>Desktop controls<select value={state.desktopMode} onChange={e => save({ desktopMode: e.target.value as 'trackpad' | 'mouse' })}><option value="trackpad">Trackpad</option><option value="mouse">Mouse + keyboard</option></select></label>
    {state.desktopMode === 'trackpad' ? <TrackpadSettings /> : <p className={styles.muted}>Click the scene to capture the mouse. Use WASD to move, Space to lift or land, and Escape to pause. Left click fires and right click aims once the mouse is captured.</p>}
    <label className={styles.check}><input type="checkbox" checked={state.heroPoses} onChange={e => save({ heroPoses: e.target.checked })} /> Expressive hero poses</label>
    <label className={styles.setting}>Graphics<select value={state.quality} onChange={e => save({ quality: e.target.value as 'high' | 'low' })}><option value="high">Full detail</option><option value="low">Lighter · lower resolution, no shadows</option></select></label>
    {!coarse && <ShooterSettings coarse={false} />}
    {!coarse && anyCoarse && <TouchSettings />}
    <label className={styles.check}><input type="checkbox" checked={state.reduced} onChange={e => save({ reduced: e.target.checked })} /> Reduced camera motion</label>
    <label className={styles.check}><input type="checkbox" checked={!state.muted} onChange={e => {
      // Unmute first: the unlock reads the muted flag (and the blaster setting) before touching the audio session.
      save({ muted: !e.target.checked }); if (e.target.checked) unlockBlasterAudio();
    }} /> Suit and wind audio</label>
    <MoreControls />
    <p className={styles.muted}>Reduced motion keeps a fixed field of view, removes camera easing and softens the character’s poses. Flight itself remains player-controlled.</p>
    {anyCoarse && <ScreenDiagnostics />}
    <LabStatsTable />
    <details><summary>Playtest measurements</summary>
      <p>Active-play frame timings from this browser. A desktop simulation is not an iPhone performance test.</p>
      {stats && <dl className={styles.stats}><dt>Time sampled</dt><dd>{stats.seconds}s</dd><dt>Median frame</dt><dd>{stats.p50Ms}ms</dd><dt>95th percentile</dt><dd>{stats.p95Ms}ms</dd><dt>Frames above 50ms</dt><dd>{stats.stallsOver50Ms}</dd></dl>}
      <button className={styles.secondary} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(measurements(), null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'halaverga-playtest.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download measurements</button>
    </details>
    <button className={styles.secondary} onClick={() => { runtime.reset = true; onClose(); }}>Return to arrival terrace</button>
  </Modal>;
}
