import { useState } from 'react';
import { persistGame, useGame, type TrackpadProfile } from '@/game/store';
import { gestureLog, gestureRecording, startGestureLog } from '@/game/gestureLog';
import styles from './Experience.module.css';
export default function TrackpadSettings() {
  const state = useGame(), [recording, setRecording] = useState(gestureLog.enabled);
  const save = (patch: Parameters<typeof state.set>[0]) => { state.set(patch); persistGame(); };
  const edge = state.sustainedEdges ? 'Turning continues while the pointer stays at an edge, or after it slides off the side of the window (default).' : 'Edge turns fade when pointer movement stops.';
  // Free cursor with the blaster on (Garo 2026-09-24): the classic flight plus one change, a click while stopped fires.
  const freeShooter = 'Space starts flying; in the air W does too. Move the pointer to steer, hold near an edge to keep turning, and scroll for speed. Click or press Space to stop and hover. While stopped or on the ground, a click fires at the centre reticle when you let go, and dragging only looks. Hold C to fire and ' + (state.aimToggle ? 'press Q to toggle aim' : 'hold Q to aim') + ' at any time. Blaster sound starts off; turn on Suit and wind audio below. ' + edge + ' Escape pauses.';
  return <fieldset><legend>Trackpad controls</legend>
    <label className={styles.setting}>Trackpad steering<select value={state.trackpadSteering} onChange={e => save({ trackpadSteering: e.target.value as TrackpadProfile })}>
      <option value="free">Classic · Free cursor · recommended</option><option value="simple">One finger + keyboard</option><option value="captured">Classic · Captured steering</option><option value="flow">Flow · scroll experiment</option>
    </select></label>
    <p className={styles.muted}>{state.trackpadSteering === 'simple' ? state.shooter ? `Click the scene to look freely (that click never fires or lifts). Slide to look · click to fire (hold for auto) · ${state.aimToggle ? 'Q toggles' : 'hold Q to'} aim · WASD fly · Space lift/land · Esc pause.` : 'Click the scene to lift into hover, then slide one finger to look. Hold WASD to move; release to hover. R/F rise and descend, Shift toggles Surge, Space lands. Click again to stop and free the pointer; Escape pauses. Scrolling does not control flight.' : state.trackpadSteering === 'flow' ? 'Slide to look, stroke to glide, press to hover. Looking stays free when you stop. Two-finger click releases the pointer for buttons; Escape pauses.' : state.trackpadSteering === 'free' ? state.shooter ? freeShooter : `Click to cruise, move to steer, and scroll for speed. Click again to hover. ${edge}` : 'Click to cruise with unlimited turning. The pointer hides during flight. Click again to brake and release it; then use any button normally. Escape pauses.'}</p>
    {['simple', 'flow'].includes(state.trackpadSteering) &&
      <label className={styles.setting}>Looking sensitivity · {state.lookSensitivity.toFixed(1)}×<input type="range" min=".5" max="2" step=".1" value={state.lookSensitivity} onChange={e => save({ lookSensitivity: e.target.valueAsNumber })} /></label>
    }
    {state.trackpadSteering === 'flow' && <button className={styles.secondary} onClick={() => save({ flowIntroSeen: false })}>Show Flow introduction on resume</button>}
    {state.trackpadSteering === 'free' && <label className={styles.check}><input type="checkbox" checked={state.sustainedEdges} onChange={e => save({ sustainedEdges: e.target.checked })} /> Keep turning while the pointer stays at an edge</label>}
    {state.trackpadSteering !== 'simple' && <label className={styles.check}><input type="checkbox" checked={state.reverseScroll} onChange={e => save({ reverseScroll: e.target.checked })} /> Reverse scroll direction</label>}
    {['free', 'captured'].includes(state.trackpadSteering) && <label className={styles.setting}>Starting cruise speed (m/s)<input type="number" min="3" max="34" step="1" value={state.cruiseSpeed} onChange={e => {
      const value = e.target.valueAsNumber; if (Number.isFinite(value)) save({ cruiseSpeed: Math.max(3, Math.min(34, value)) });
    }} /></label>}
    <p className={styles.muted}>Two-finger scroll sets cruise speed; pinch zoom stops flight. One finger + keyboard needs no multi-finger gesture. Prefer one hand? {state.shooter ? 'Enable tap controls under More controls below.' : 'Enable the tap controls below.'}</p>
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
