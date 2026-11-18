'use client';

import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PerspectiveCamera } from 'three';
import Boundary from '@/ui/Boundary';
import { EXPOSURE } from '@/world/atmospherePalette';
import CrossingActors, { clearCrossingModels } from './CrossingActors';
import CrossingLandscape from './CrossingLandscape';
import { crossingCamera } from './crossingCamera';
import { WALK_END } from './crossingWalk';
import { stepCrossing, type Crossing, type CrossingInput, type Phase } from './flight';
import { createWatcherMarker } from './watcherMarker';

type Props = {
  flight: Crossing; input: CrossingInput; marker: RefObject<HTMLDivElement | null>; paused: boolean; reduced: boolean;
  onReady: () => void; onLoss: () => void; onChange: (phase: Phase, inReach: boolean) => void;
};

function Frame({ flight, input, marker, paused, reduced, onReady, onChange }: Props) {
  const invalidate = useThree(s => s.invalidate);
  const aim = useMemo(crossingCamera, []);
  const mark = useMemo(createWatcherMarker, []);
  const last = useRef<{ phase?: Phase; inReach?: boolean; stopped: boolean }>({ stopped: true });
  const requestedPhase = flight.phase;
  useLayoutEffect(() => { onReady(); invalidate(); }, [onReady, invalidate]);
  useLayoutEffect(() => { invalidate(); }, [requestedPhase, paused, reduced, invalidate]);
  useFrame(({ camera, size }, delta) => {
    const memo = last.current;
    const launch = flight.phase === 'flight' && memo.phase !== 'flight' && memo.phase !== 'strike';
    if (!paused) {
      stepCrossing(flight, input, memo.stopped || launch ? 0 : delta);
      input.strike = false;
    }
    if (camera instanceof PerspectiveCamera) {
      aim(camera, flight, size.width, size.height, reduced);
      mark(marker.current, camera, flight, size.width, size.height);
    }
    if (memo.phase !== flight.phase || memo.inReach !== flight.inReach) onChange(flight.phase, flight.inReach);
    memo.phase = flight.phase; memo.inReach = flight.inReach; memo.stopped = paused || flight.phase === 'ready';
    if (!memo.stopped && flight.after < WALK_END) invalidate();
  }, -40);
  return null;
}

export default function CrossingWorld(props: Props) {
  const { onLoss } = props;
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const lost = (event: Event) => { event.preventDefault(); onLoss(); };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextcreationerror', lost);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextcreationerror', lost);
    };
  }, [onLoss]);
  const assetFailure = useCallback(() => { clearCrossingModels(); onLoss(); }, [onLoss]);
  return <Canvas ref={attach} role="img" aria-label="Two travelers on the Cloven Arch, a winged angel and a Watcher over Mount Hermon at dawn."
    frameloop="demand" dpr={[1, 1.5]} camera={{ position: [22.65, 16, -6.2], near: .1, far: 850, fov: 65 }}
    gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
    onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = EXPOSURE; }}>
    <CrossingLandscape flight={props.flight} reduced={props.reduced}>{surface =>
      <Boundary fallback={null} onError={assetFailure}><Suspense fallback={null}>
        <CrossingActors flight={props.flight} paused={props.paused} reduced={props.reduced} surface={surface} />
        <Frame {...props} />
      </Suspense></Boundary>}
    </CrossingLandscape>
  </Canvas>;
}
