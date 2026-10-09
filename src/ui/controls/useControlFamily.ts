import { useSyncExternalStore } from 'react';
import type { ControlFamily } from '@/game/controlTypes';
import { currentFamily, onFamily, watchFamily } from './family';

const subscribe = (fn: () => void) => { watchFamily(); return onFamily(fn); };
const server = (): ControlFamily => 'desktop';
/** The family the player is using now: 'desktop' for the server render, then the last pointer (family.ts). */
export function useControlFamily(): ControlFamily {
  return useSyncExternalStore(subscribe, currentFamily, server);
}
