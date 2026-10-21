import { useMemo } from 'react';
import PaintedBlocks from './PaintedBlocks';
import { houseBlocks } from './villageHouseData';

/** Stone houses on the opening court. One mesh, no collider, no photo. */
export default function VillageHouses() {
  const parts = useMemo(() => houseBlocks(), []);
  return <PaintedBlocks parts={parts} />;
}
