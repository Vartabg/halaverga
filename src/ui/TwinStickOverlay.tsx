import type { ReactNode, RefObject } from 'react';
import { useGame } from '@/game/store';
import { STICK } from '@/game/twinStick';
import type { TouchLayout } from '@/game/touchLayout';
import type { ViewBox } from './touchInsets';
import styles from './TouchControls.module.css';
// Visuals for the twin-stick scheme: the floating stick (ring + knob), its resting ghost, the BOOST / CRUISE cues and the
// safe-area probe. While flying, a chevron above the ring marks the sprint zone (push the thumb into it to boost). Everything sits in one fixed layer covering the visual viewport box, so box-local layout numbers are
// pixel positions here. Per-move positions are written through refs by useTwinStick, never through React state.
export type TwinRefs = {
  ring: RefObject<HTMLDivElement | null>; knob: RefObject<HTMLDivElement | null>; ghost: RefObject<HTMLDivElement | null>;
  cues: RefObject<HTMLDivElement | null>; boost: RefObject<HTMLSpanElement | null>; cruise: RefObject<HTMLSpanElement | null>;
  layer: RefObject<HTMLDivElement | null>;
};
export type OverlayProps = {
  view: { box: ViewBox; layout: TouchLayout } | null; probe: (node: HTMLDivElement | null) => void;
  refs: TwinRefs; opacity: number; reduced: boolean;
};
export default function TwinStickOverlay({ view, probe, refs, opacity, reduced, children }: OverlayProps & { children?: ReactNode }) {
  const flying = useGame(s => s.flying);
  const probeNode = <div ref={probe} className={styles.probe} aria-hidden="true" />;
  if (!view) return probeNode;
  const { box, layout } = view, d = 2 * layout.R + 16, knob = 48 * layout.k;
  const ghost = layout.ghost;
  return <>
    {probeNode}
    <div ref={refs.layer} className={styles.layer} data-reduced={String(reduced)} data-testid="touch-layer"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ['--touch-opacity' as string]: String(opacity) }}>
      <div ref={refs.ghost} className={styles.ghost} data-testid="touch-ghost" aria-hidden="true" hidden={!ghost}
        style={ghost ? { left: ghost.x - d / 2, top: ghost.y - d / 2, width: d, height: d } : undefined} />
      <div ref={refs.ring} className={styles.ring} data-testid="touch-stick" aria-hidden="true" hidden data-boost="false"
        style={{ left: 0, top: 0, width: d, height: d }}>
        <div ref={refs.knob} className={styles.knob} style={{ width: knob, height: knob, margin: -knob / 2 }} />
        {/* Centred in the sprint zone: 1.5 R to 1.9 R above the base, which sits at the ring's centre (R + 8). */}
        {flying && <svg className={styles.sprint} data-testid="touch-sprint" viewBox="0 0 24 20" aria-hidden="true"
          style={{ top: layout.R + 8 - (STICK.sprint + .2) * layout.R }}>
          <path className={styles.sprintEdge} d="M4 10l8-7 8 7M4 17l8-7 8 7" /><path d="M4 10l8-7 8 7M4 17l8-7 8 7" />
        </svg>}
      </div>
      <div ref={refs.cues} className={styles.cues} aria-hidden="true" hidden>
        <span ref={refs.boost} className={styles.cue} hidden>BOOST</span>
        <span ref={refs.cruise} className={styles.cue} hidden>CRUISE</span>
      </div>
      {children}
    </div>
  </>;
}
