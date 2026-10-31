import type { ReactNode } from 'react';
import { useGame } from '@/game/store';

/**
 * Reusable component preserving legacy Mount Hermon free-flight flora, cedars, and village court props.
 * Keeps legacy environment meshes reusable for free-flight (?shooter=0) while hiding low-poly cone trees during the Sanctuary Duel.
 */
export default function LegacySanctuaryFlora({ children }: { children: ReactNode }) {
  const shooter = useGame(s => s.shooter);
  return <group name="legacy-sanctuary-flora" visible={!shooter}>{children}</group>;
}
