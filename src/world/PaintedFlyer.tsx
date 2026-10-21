import { useMemo } from 'react';
import PaintedBlocks from './PaintedBlocks';
import { FLIER, paintedFlyerBlocks } from './paintedFlyerPose';
import type { FlyerPose } from './paintedFlyerPose';

/** The winged painted man: the flight-level protagonist on the village paint bar. Visual only, no collider. */
export default function PaintedFlyer({ pose = 'hover' }: { pose?: FlyerPose }) {
  const parts = useMemo(() => paintedFlyerBlocks(pose), [pose]);
  return <PaintedBlocks parts={parts} position={[FLIER.x, FLIER.y, FLIER.z]} rotation={[0, FLIER.yaw, 0]} />;
}
