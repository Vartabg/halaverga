import { useEffect, useRef, useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { pause, resume } from './useInput';
import Modal from './Modal';
import styles from './Experience.module.css';
import flowStyles from './Flow.module.css';

export default function FlowWelcome() {
  const state = useGame(), pad = useRef<HTMLDivElement>(null), total = useRef(0);
  const [stage, setStage] = useState(0), [angle, setAngle] = useState(0), [reverse, setReverse] = useState<boolean | null>(null);
  const [fine] = useState(() => matchMedia('(pointer:fine)').matches);
  useEffect(() => { if (fine) pause(); }, [fine]);
  useEffect(() => {
    const element = pad.current; if (!element || stage !== 1) return;
    const wheel = (e: WheelEvent & { momentum?: boolean }) => {
      if (e.ctrlKey || e.metaKey || e.momentum === true) return;
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      total.current += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
      if (Math.abs(total.current) >= 12) setReverse(total.current > 0);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [stage]);
  const finish = (practice: boolean) => {
    state.set({ flowIntroSeen: true, ...(practice && reverse !== null ? { reverseScroll: reverse } : {}) }); persistGame();
    Object.assign(runtime.flowPractice, { step: practice ? 'look' : 'idle', yaw: runtime.yaw, pitch: runtime.pitch }); resume();
  };
  if (!fine) return null;
  return <Modal title="Find your flow" onClose={() => finish(false)}>
    <p className={flowStyles.kicker}>A LIGHT TOUCH. A WHOLE WORLD.</p>
    {stage === 0 ? <>
      <p>Slide one finger to look. You never need to hold a click, even when the character is still.</p>
      <div ref={pad} className={flowStyles.practicePad} onPointerMove={e => {
        if (e.pointerType === 'mouse') setAngle(a => a + e.movementX * .003 * state.lookSensitivity);
      }}><span className={flowStyles.compass} style={{ transform: `rotate(${angle}rad)` }}>↑</span><span>Slide across this area to find a comfortable sensitivity.</span></div>
      <label className={styles.setting}>Looking sensitivity · {state.lookSensitivity.toFixed(1)}×<input type="range" min=".5" max="2" step=".1" value={state.lookSensitivity} onChange={e => state.set({ lookSensitivity: e.target.valueAsNumber })} /></label>
      <button className={styles.primary} onClick={() => setStage(1)}>Check scroll direction</button>
    </> : <>
      <p>With your pointer over the area below, slide two fingers <strong>away from you</strong>. We’ll make that your forward stroke.</p>
      <div ref={pad} className={flowStyles.practicePad} tabIndex={0} aria-label="Scroll direction practice area">
        <span className={flowStyles.compass}>↑</span><span role="status">{reverse === null ? 'Try one gentle two-finger stroke.' : 'Forward stroke detected. You’re ready to glide.'}</span>
      </div>
      <p>Stroke forward to glide, backward to slow, and press once to settle into hover. Rest your hand whenever you like; your selected speed stays steady.</p>
      <p className={styles.muted}>Two-finger click releases the pointer for controls. Escape pauses. Your Mac’s secondary-click setting determines whether two-finger click is available.</p>
      <button className={styles.primary} disabled={reverse === null} onClick={() => finish(true)}>Use this direction & practice</button>
    </>}
    <button className={styles.secondary} onClick={() => finish(false)}>Skip introduction</button>
  </Modal>;
}
