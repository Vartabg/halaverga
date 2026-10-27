'use client';
import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { handleBossKeyDown, handleBossMouseDown } from './bossKeys';

export function useBossInput() {
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const state = useGame.getState();
      const targetTag = (e.target as HTMLElement)?.tagName ?? '';
      handleBossKeyDown({ code: e.code, repeat: e.repeat, targetTag }, state);
    };

    const mousedown = (e: MouseEvent) => {
      const state = useGame.getState();
      const targetTag = (e.target as HTMLElement)?.tagName ?? '';
      handleBossMouseDown(e.button, targetTag, state);
    };

    window.addEventListener('keydown', keydown);
    window.addEventListener('mousedown', mousedown);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('mousedown', mousedown);
    };
  }, []);
}
