import { useState } from 'react';
import { persistGame, useGame, type TrackpadProfile } from '@/game/store';
import { gestureLog, gestureRecording, startGestureLog } from '@/game/gestureLog';
import styles from './Experience.module.css';
export default function TrackpadSettings() {
  const state = useGame(), [recording, setRecording] = useState(gestureLog.enabled);
  const save = (patch: Parameters<typeof state.set>[0]) => { state.set(patch); persistGame(); };
  return <fieldset><legend>Trackpad comparison</legend>
    <label className={styles.setting}>Trackpad steering<select value={state.trackpadSteering} onChange={e => save({ trackpadSteering: e.target.value as TrackpadProfile })}>
      <option value="free">A · Free cursor</option><option value="captured">B · Captured steering</option><option value="flow">Flow · preview</option>
    </select></label>
    <p className={styles.muted}>{state.trackpadSteering === 'flow' ? 'Slide to look, stroke to glide, press to hover. Looking stays free when you stop. Two-finger click releases the pointer for buttons; Escape pauses.' : state.trackpadSteering === 'free' ? `Click to cruise, move to steer, and scroll for speed. Click again to hover. ${state.sustainedEdges ? 'Turning continues while the pointer stays at an edge.' : 'Edge turns fade when pointer movement stops.'}` : 'Click to cruise with unlimited turning. The pointer hides during flight. Click again to brake and release it; then use any button normally. Escape pauses.'}</p>
    {state.trackpadSteering === 'flow' && <>
      <label className={styles.setting}>Looking sensitivity · {state.lookSensitivity.toFixed(1)}×<input type="range" min=".5" max="2" step=".1" value={state.lookSensitivity} onChange={e => save({ lookSensitivity: e.target.valueAsNumber })} /></label>
      <button className={styles.secondary} onClick={() => save({ flowIntroSeen: false })}>Show Flow introduction on resume</button>
    </>}
    {state.trackpadSteering === 'free' && <label className={styles.check}><input type="checkbox" checked={state.sustainedEdges} onChange={e => save({ sustainedEdges: e.target.checked })} /> Keep turning while the pointer stays at an edge</label>}
    <label className={styles.check}><input type="checkbox" checked={state.reverseScroll} onChange={e => save({ reverseScroll: e.target.checked })} /> Reverse scroll direction</label>
    {state.trackpadSteering !== 'flow' && <label className={styles.setting}>Starting cruise speed (m/s)<input type="number" min="3" max="34" step="1" value={state.cruiseSpeed} onChange={e => {
      const value = e.target.valueAsNumber; if (Number.isFinite(value)) save({ cruiseSpeed: Math.max(3, Math.min(34, value)) });
    }} /></label>}
    <p className={styles.muted}>Compare from the same arrival terrace. Flow begins in hover and keeps the speed you choose until you change it or stop.</p>
    <p><a href="/?trackpad=flow">Try Flow</a> · <a href="/?trackpad=free">Compare free cursor</a> · <a href="/?trackpad=captured">Compare captured steering</a></p>
    <details><summary>Local gesture recording</summary>
      <p>Record a few real trackpad strokes, then return here to download them. Input stays in this browser; recording keeps the latest 6,000 events.</p>
      <button className={styles.secondary} aria-pressed={recording} onClick={() => {
        if (recording) gestureLog.enabled = false; else startGestureLog(); setRecording(!recording);
      }}>{recording ? 'Stop recording gestures' : 'Start a new gesture recording'}</button>
      <button className={styles.secondary} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(gestureRecording(), null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'halaverga-gestures.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download gesture recording</button>
    </details>
  </fieldset>;
}
