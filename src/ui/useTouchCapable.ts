import { useSyncExternalStore } from 'react';
import { onTouchCapable, touchCapable } from '@/game/pointerMode';
/** React view of touchCapable(): false on the server and on a desktop that has never shown touch; re-renders on a flip. */
export function useTouchCapable(): boolean {
  return useSyncExternalStore(onTouchCapable, touchCapable, () => false);
}
