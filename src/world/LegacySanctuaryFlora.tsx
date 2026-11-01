import type { ReactNode } from 'react';
import { gowRuntime } from '@/game/gowTypes';

/**
 * Reusable component preserving legacy Mount Hermon free-flight flora, cedars, and village court props.
 * Keeps legacy environment meshes active for 3D flight while stepping aside if the Sanctuary Duel (?duel=1) is engaged.
 */
export default function LegacySanctuaryFlora({ children }: { children: ReactNode }) {
  return <group name="legacy-sanctuary-flora" visible={!gowRuntime.duelEngaged}>{children}</group>;
}
