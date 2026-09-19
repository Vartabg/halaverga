import { useEffect, useState } from 'react';
import { runtime } from '@/game/runtime';
import { persistGame, useGame } from '@/game/store';
import styles from './Flow.module.css';
const sample = () => ({ capture: runtime.trackpad.capture, failed: runtime.trackpad.captureFailed, selected: runtime.trackpad.selectedSpeed, speed: runtime.speed, step: runtime.flowPractice.step });
const prompts = { idle: '', look: 'Slide one finger to look around.', glide: 'Stroke forward with two fingers to glide.', brake: 'Press once to settle. Looking will stay free.', done: 'That’s Flow. Take your time.' };
export default function FlowHud() {
  const [view, setView] = useState(sample), flying = useGame(s => s.flying);
  useEffect(() => {
    let doneAt = 0;
    const timer = setInterval(() => {
      const p = runtime.flowPractice, t = runtime.trackpad;
      if (t.capture === 'engaged') {
        if (p.step === 'look' && Math.hypot(runtime.yaw - p.yaw, runtime.pitch - p.pitch) > .25) p.step = 'glide';
        else if (p.step === 'glide' && t.selectedSpeed > 0 && runtime.speed > .5) p.step = 'brake';
        else if (p.step === 'brake' && t.selectedSpeed === 0 && runtime.speed < .1) { p.step = 'done'; doneAt = performance.now(); }
      }
      if (p.step === 'done' && performance.now() - doneAt > 4000) p.step = 'idle';
      setView(sample());
    }, 100);
    return () => clearInterval(timer);
  }, []);
  const engaged = view.capture === 'engaged';
  return <div className={styles.hud} data-testid="flow-hud" data-capture={view.capture} data-selected-speed={view.selected.toFixed(3)}>
    <div className={styles.readout}><span>FLOW</span><strong>{view.selected > 0 ? `${view.selected.toFixed(1)} m/s` : view.speed > .1 ? 'Settling' : flying ? 'Hover' : 'Ready'}</strong><span className={styles.speedBar} aria-hidden="true"><i style={{ width: `${view.selected / 34 * 100}%` }} /></span></div>
    <p>{engaged ? prompts[view.step] || 'SLIDE TO LOOK · STROKE FOR SPEED · PRESS TO HOVER' : view.capture === 'requesting' ? 'Getting ready…' : flying ? 'CLICK THE SCENE TO LOOK FREELY' : 'CLICK THE SCENE TO LIFT INTO HOVER'}</p>
    <small>{engaged ? 'TWO-FINGER CLICK FOR CONTROLS · ESC TO PAUSE' : 'Your pointer is free for controls.'}</small>
    {view.failed && <button className={styles.fallback} onClick={() => { useGame.setState({ trackpadSteering: 'free', message: '' }); persistGame(); }}>Use free cursor controls</button>}
  </div>;
}
