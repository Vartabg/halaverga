'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
import { touchMode } from '@/game/pointerMode';
import { trackpadPill } from './trackpadPill';
import Boundary from './Boundary';
import styles from './Experience.module.css';

const FlowHud = dynamic(() => import('./FlowHud'), { ssr: false, loading: () => null });
const SimpleTrackpadHud = dynamic(() => import('./SimpleTrackpadHud'), { ssr: false, loading: () => null });
const skip = () => {};
const Optional = ({ children }: { children: ReactNode }) => <Boundary fallback={null} onError={skip}>{children}</Boundary>;

/**
 * Reusable Legacy Flight Overlay component preserving the free-flight Lift/Land action button,
 * FlowHud, SimpleTrackpadHud, and desktop flight legend for future modes and ?shooter=0 free-flight.
 * Automatically steps aside once a Sanctuary Duel action or Prototype Mode is engaged.
 */
export default function LegacyFlightOverlay() {
  const state = useGame();
  const [duelEngaged, setDuelEngaged] = useState(() =>
    typeof window !== 'undefined' && Boolean((window as unknown as { __gowDuelEngaged?: boolean }).__gowDuelEngaged),
  );

  useEffect(() => {
    const sync = () => {
      setDuelEngaged(Boolean((window as unknown as { __gowDuelEngaged?: boolean }).__gowDuelEngaged));
    };
    sync();
    window.addEventListener('gow-duel-engaged', sync);
    return () => window.removeEventListener('gow-duel-engaged', sync);
  }, []);

  const standard = state.controlLab === 'standard';
  const twin = state.touchScheme === 'twin';
  const showDuelDeck = state.shooter && !state.tapControls && standard && !twin;
  if (showDuelDeck && duelEngaged) return null;
  const pill = standard && trackpadPill({
    steering: state.trackpadSteering,
    shooter: state.shooter,
    cruising: state.trackpadFlying,
    flying: state.flying,
    canLand: state.canLand,
  });

  return <>
    <div className={styles.actions} data-ghost-avoid="" data-shooter={String(state.shooter)} data-twin={String(twin && standard)}>
      <button className={styles.action} onMouseDown={e => { if (!touchMode()) e.preventDefault(); }} onClick={() => { runtime.lift = true; }}>
        <span aria-hidden="true">{state.flying ? '↓' : '↑'}</span>
        {state.landing ? 'Cancel landing' : state.flying ? 'Land' : 'Lift'}
      </button>
    </div>
    {standard && state.desktopMode === 'trackpad' && state.trackpadSteering === 'flow' && <Optional><FlowHud /></Optional>}
    {standard && state.desktopMode === 'trackpad' && state.trackpadSteering === 'simple' && <Optional><SimpleTrackpadHud /></Optional>}
    {state.desktopMode === 'trackpad' && pill && !state.limitHint && <div className={styles.legend} data-testid="legend">{pill}</div>}
  </>;
}
