import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import Modal from './Modal';
import styles from './Experience.module.css';
import TrackpadSettings from './TrackpadSettings';
import MoreControls from './MoreControls';
import { unlockBlasterAudio } from './audioUnlock';
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
export default function TestPanel({ onClose }: { onClose: () => void }) {
  const state = useGame(), [stats, setStats] = useState<ReturnType<typeof measurements> | null>(null);
  // Touch screens: the blaster section (Auto-fire) leads, above main's desktop and trackpad sections, so it is not below the fold.
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => { setStats(measurements()); }, []);
  const save = (patch: Parameters<typeof state.set>[0]) => { state.set(patch); persistGame(); };
  return <Modal title="Flight settings" onClose={onClose}>
    <p>Adjust the experience, resume, and try the same route again.</p>
    {coarse && <ShooterSettings coarse />}
    <fieldset><legend>Perspective</legend><div className={styles.segment}>
      <button aria-pressed={state.camera === 'third'} onClick={() => save({ camera: 'third' })}>Third person</button>
      <button aria-pressed={state.camera === 'first'} onClick={() => save({ camera: 'first' })}>First person</button>
    </div></fieldset>
    <label className={styles.setting}>Desktop controls<select value={state.desktopMode} onChange={e => save({ desktopMode: e.target.value as 'trackpad' | 'mouse' })}><option value="trackpad">Trackpad</option><option value="mouse">Mouse + keyboard</option></select></label>
    {state.desktopMode === 'trackpad' ? <TrackpadSettings /> : <p className={styles.muted}>Click the scene to capture the mouse. Use WASD to move, Space to lift or land, and Escape to pause. Left click fires and right click aims once the mouse is captured.</p>}
    <label className={styles.check}><input type="checkbox" checked={state.heroPoses} onChange={e => save({ heroPoses: e.target.checked })} /> Expressive hero poses</label>
    <label className={styles.setting}>Graphics<select value={state.quality} onChange={e => save({ quality: e.target.value as 'high' | 'low' })}><option value="high">Full detail</option><option value="low">Lighter · lower resolution, no shadows</option></select></label>
    {!coarse && <ShooterSettings coarse={false} />}
    <label className={styles.check}><input type="checkbox" checked={state.reduced} onChange={e => save({ reduced: e.target.checked })} /> Reduced camera motion</label>
    <label className={styles.check}><input type="checkbox" checked={!state.muted} onChange={e => {
      // Unmute first: the unlock reads the muted flag (and the blaster setting) before touching the audio session.
      save({ muted: !e.target.checked }); if (e.target.checked) unlockBlasterAudio();
    }} /> Suit and wind audio</label>
    <MoreControls />
    <p className={styles.muted}>Reduced motion keeps a fixed field of view, removes camera easing and softens the character’s poses. Flight itself remains player-controlled.</p>
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
