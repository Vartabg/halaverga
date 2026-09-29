'use client';
import { useState } from 'react';
import { demoSeen, markDemoSeen } from './demoSeen';
import styles from './ControlsPicker.module.css';

export const DEMO_COPY = 'A demo of new ways to fly. After you begin, try each in the Controls menu, then vote.';

/** First visit only, inside the start card under the hint. Landscape phones (max-height 430 px) hide it by CSS: the trigger it names is a post-Begin control. */
export default function DemoNote() {
  const [open, setOpen] = useState(() => !demoSeen());
  if (!open) return null;
  return <div role="note" className={styles.demo} data-testid="demo-note">
    <p>{DEMO_COPY}</p>
    <button type="button" onClick={() => { markDemoSeen(); setOpen(false); }}>Got it</button>
  </div>;
}
