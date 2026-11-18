import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import type { CrossingInput } from './flight';

const steerKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export function useCrossingInput(input: CrossingInput, active: boolean) {
  const keys = useRef(new Set<string>());
  const drag = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const clear = useCallback(() => {
    keys.current.clear();
    drag.current = null;
    input.horizontal = input.vertical = 0;
    input.strike = false;
  }, [input]);

  const steer = useCallback(() => {
    const held = keys.current;
    const x = Number(held.has('ArrowRight') || held.has('KeyD')) - Number(held.has('ArrowLeft') || held.has('KeyA'));
    const y = Number(held.has('ArrowUp') || held.has('KeyW')) - Number(held.has('ArrowDown') || held.has('KeyS'));
    input.horizontal = clamp(x + (drag.current?.dx ?? 0));
    input.vertical = clamp(y + (drag.current?.dy ?? 0));
  }, [input]);

  useEffect(() => {
    clear();
    if (!active) return;
    const down = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.code === 'Space' && (event.target as HTMLElement).closest('button, a')) return;
      if (event.code === 'Space' || event.code === 'KeyC') {
        event.preventDefault();
        if (!event.repeat) input.strike = true;
      } else if (steerKeys.has(event.code)) {
        event.preventDefault();
        if (!event.repeat) { keys.current.add(event.code); steer(); }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (keys.current.delete(event.code)) { event.preventDefault(); steer(); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); clear(); };
  }, [active, clear, input, steer]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!active || drag.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (held?.id !== e.pointerId) return;
    const travel = Math.min(70, Math.max(36, e.currentTarget.clientWidth * .1));
    held.dx = clamp((e.clientX - held.x) / travel);
    held.dy = clamp((held.y - e.clientY) / travel);
    steer();
  }
  function release(e: PointerEvent<HTMLDivElement>, strike: boolean) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    steer();
    if (active && strike) input.strike = true;
  }
  return {
    clear,
    surface: {
      onPointerDown, onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => release(e, true),
      onPointerCancel: (e: PointerEvent<HTMLDivElement>) => release(e, false),
      onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => release(e, false),
    },
  };
}
