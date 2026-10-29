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
import { gowRuntime } from './gowTypes';
import { runtime, stopTrackpad } from './runtime';
import { useGame } from './store';

function isUiElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, dialog, [role="dialog"], [data-controls-sheet], [data-gow-hud]',
    ),
  );
}

function updateCursorPlane(clientX: number, clientY: number) {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 1 || h < 1) return;
  const aim = runtime.shooter.aim;
  if (!aim.valid) return;
  const ndcX = (clientX / w) * 2 - 1, ndcY = 1 - (clientY / h) * 2;
  const aspect = w / h, tanHalf = Math.tan(((aim.fov || 50) * Math.PI) / 360);
  const rx = aim.dir.x + aim.right.x * ndcX * aspect * tanHalf + aim.up.x * ndcY * tanHalf;
  const ry = aim.dir.y + aim.right.y * ndcX * aspect * tanHalf + aim.up.y * ndcY * tanHalf;
  const rz = aim.dir.z + aim.right.z * ndcX * aspect * tanHalf + aim.up.z * ndcY * tanHalf;
  if (ry < -0.05) {
    const t = (20.0 - aim.origin.y) / ry;
    if (t > 0 && t < 80) {
      gowRuntime.cursorWorldX = aim.origin.x + rx * t;
      gowRuntime.cursorWorldZ = aim.origin.z + rz * t;
      gowRuntime.cursorActiveTimer = 2.5;
    }
  }
}

export function useGowInput() {
  useEffect(() => {
    const canAct = () => {
      const s = useGame.getState();
      return s.started && !s.paused && s.shooter && !s.panel && !s.journal && !s.controlsOpen && !s.voteOpen;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isUiElement(e.target) || !canAct()) return;
      const s = useGame.getState(), reduced = s.reduced;
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        e.preventDefault();
        stopTrackpad();
        runtime.landGoal = null;
        const nextFly = !s.flying;
        runtime.velocity.y = nextFly ? 8 : -12;
        useGame.setState({ flying: nextFly, landing: false });
        return;
      }

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
          case 'KeyC':
            e.preventDefault();
            runtime.landGoal = null;
            runtime.velocity.y = -12;
            useGame.setState({ flying: false, landing: false });
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            e.preventDefault();
            triggerDodgeRoll(reduced);
            break;
          case 'KeyV':
            e.preventDefault();
            triggerWingedRage(reduced);
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
          if (!s.nearTerminal && triggerStunExecute(reduced)) e.preventDefault();
          break;
        default:
          break;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && canAct()) updateCursorPlane(e.clientX, e.clientY);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!canAct()) return;
      const s = useGame.getState(), reduced = s.reduced;
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
      if (e.pointerType !== 'mouse' || isUiElement(e.target)) return;
      updateCursorPlane(e.clientX, e.clientY);
      if (e.button === 0) {
        if (s.flying) triggerAerialSwoop(reduced);
        else triggerLightAttack(reduced);
      } else if (e.button === 2) {
        e.preventDefault();
        if (s.flying) triggerSkySwordBeam(reduced);
        else triggerParry(reduced);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!isUiElement(e.target) && canAct()) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);
}
