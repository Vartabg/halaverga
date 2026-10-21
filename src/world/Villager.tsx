import { useMemo } from 'react';
import PaintedBlocks from './PaintedBlocks';
import { VILLAGER, villagerBlocks } from './villagerPose';

/** The opening figure: a human on foot. Local front is -z. Yaw turns that face toward the arrival camera. */
export default function Villager() {
  const parts = useMemo(() => villagerBlocks(), []);
  return <PaintedBlocks parts={parts} position={[VILLAGER.x, VILLAGER.y, VILLAGER.z]} rotation={[0, VILLAGER.yaw, 0]} />;
}
