import { useMemo } from 'react';
import { makeUnderstory } from './reclamationData';
import IvyCards from './IvyCards';
import Cedars from './Cedars';

/** Kept for Suit.clearWorldCache compatibility; the dead GLB grove is gone (living cedars are procedural, Cedars.tsx). */
export const TREE_URL = '/models/environment/island_tree_01.glb';

export default function Reclamation() {
  const understory = useMemo(makeUnderstory, []);
  return <><Cedars /><IvyCards plants={understory} /></>;
}
