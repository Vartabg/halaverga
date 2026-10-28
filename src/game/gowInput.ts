'use client';

import { useEffect } from 'react';
import {
  triggerAerialSwoop,
  triggerDodgeRoll,
  triggerHeavyBash,
  triggerLightAttack,
  triggerParry,
  triggerRunicSpell,
  triggerSkySwordBeam,
  triggerStunExecute,
  triggerWingedRage,
} from './gowCombat';
import { useGame } from './store';

function isUiElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, dialog, [role="dialog"], [data-controls-sheet], [data-gow-hud]',
    ),
  );
}

export function useGowInput() {
  useEffect(() => {
    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let validLeftClick = false;

    const canAct = () => {
      const s = useGame.getState();
      return (
        s.started &&
        !s.paused &&
        s.shooter &&
        !s.panel &&
        !s.journal &&
        !s.controlsOpen &&
        !s.voteOpen
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isUiElement(e.target) || !canAct()) return;
      const s = useGame.getState();
      const reduced = s.reduced;

      if (s.flying) {
        switch (e.code) {
          case 'KeyJ':
            e.preventDefault();
            triggerAerialSwoop(reduced);
            break;
          case 'KeyK':
          case 'KeyQ':
          case 'KeyG':
            e.preventDefault();
            triggerSkySwordBeam(reduced);
            break;
          default:
            break;
        }
        return;
      }

      switch (e.code) {
        case 'KeyJ':
          e.preventDefault();
          triggerLightAttack(reduced);
          break;
        case 'KeyK':
          e.preventDefault();
          triggerHeavyBash(reduced);
          break;
        case 'KeyQ':
          e.preventDefault();
          triggerParry(reduced);
          break;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
          e.preventDefault();
          triggerDodgeRoll(reduced);
          break;
        case 'KeyG':
          e.preventDefault();
          triggerRunicSpell(reduced);
          break;
        case 'KeyV':
          e.preventDefault();
          triggerWingedRage(reduced);
          break;
        case 'KeyE':
          if (!s.nearTerminal) {
            if (triggerStunExecute(reduced)) e.preventDefault();
          }
          break;
        default:
          break;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!canAct()) {
        validLeftClick = false;
        return;
      }
      const s = useGame.getState();
      const reduced = s.reduced;
      if (e.target instanceof HTMLElement) {
        if (e.target.closest('[data-testid="fire-button"]')) {
          if (s.flying) triggerAerialSwoop(reduced);
          else if (!triggerStunExecute(reduced)) triggerLightAttack(reduced);
          return;
        }
        if (e.target.closest('[data-testid="aim-button"]')) {
          if (s.flying) triggerSkySwordBeam(reduced);
          else triggerParry(reduced);
          return;
        }
        if (!s.flying && e.target.closest('[data-testid="descend-button"]')) {
          triggerDodgeRoll(reduced);
          return;
        }
      }
      if (e.pointerType !== 'mouse' || isUiElement(e.target)) {
        validLeftClick = false;
        return;
      }
      if (e.button === 0) {
        downX = e.clientX;
        downY = e.clientY;
        downTime = performance.now();
        validLeftClick = true;
      } else if (e.button === 2) {
        e.preventDefault();
        if (s.flying) triggerSkySwordBeam(reduced);
        else triggerParry(reduced);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!validLeftClick || e.button !== 0) return;
      validLeftClick = false;
      if (!canAct()) return;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      const elapsed = performance.now() - downTime;
      if (dist < 6 && elapsed < 260) {
        const s = useGame.getState();
        if (s.flying) triggerAerialSwoop(s.reduced);
        else triggerLightAttack(s.reduced);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!isUiElement(e.target) && canAct()) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);
}
