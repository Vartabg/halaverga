import Cedars from './Cedars';

/** Kept for Suit.clearWorldCache compatibility; the dead GLB grove is gone (living cedars are procedural, Cedars.tsx). */
export const TREE_URL = '/models/environment/island_tree_01.glb';

export default function Reclamation() {
  return <Cedars />;
}
