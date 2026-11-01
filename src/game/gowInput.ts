'use client';

import { useEffect } from 'react';
import { executeTurnCommand, triggerAerialSwoop, triggerDodgeRoll, triggerHeavyBash, triggerLightAttack, triggerParry, triggerRunicSpell, triggerSkySwordBeam, triggerStunExecute, triggerWingedRage } from './gowCombat';
import { executeModeCommand, handleSigilSwipe, switchDemoMode } from './gowPrototypeLab';
import { gowRuntime } from './gowTypes';
import { runtime, stopTrackpad } from './runtime';
import { useGame } from './store';

function isDialogOrInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, select, textarea, dialog, [role="dialog"], [data-controls-sheet]'));
}
function isHudOrButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (Boolean(target.closest('button, a, [data-gow-hud]')) || isDialogOrInput(target));
}

function updateCursorPlane(clientX: number, clientY: number): { x: number; z: number } | null {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 1 || h < 1) return null;
  const aim = runtime.shooter.aim;
  if (!aim.valid) return null;
  const ndcX = (clientX / w) * 2 - 1, ndcY = 1 - (clientY / h) * 2;
  const aspect = w / h, tanHalf = Math.tan(((aim.fov || 50) * Math.PI) / 360);
  const rx = aim.dir.x + aim.right.x * ndcX * aspect * tanHalf + aim.up.x * ndcY * tanHalf;
  const ry = aim.dir.y + aim.right.y * ndcX * aspect * tanHalf + aim.up.y * ndcY * tanHalf;
  const rz = aim.dir.z + aim.right.z * ndcX * aspect * tanHalf + aim.up.z * ndcY * tanHalf;
  if (ry < -0.05) {
    const t = (20.0 - aim.origin.y) / ry;
    if (t > 0 && t < 80) {
      const wx = aim.origin.x + rx * t, wz = aim.origin.z + rz * t;
      gowRuntime.cursorWorldX = wx; gowRuntime.cursorWorldZ = wz; gowRuntime.cursorActiveTimer = 2.5;
      return { x: wx, z: wz };
    }
  }
  return null;
}

export function useGowInput() {
  useEffect(() => {
    const canAct = () => {
      const s = useGame.getState();
      return s.started && !s.paused && s.shooter && !s.panel && !s.journal && !s.controlsOpen && !s.voteOpen;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isDialogOrInput(e.target) || !canAct()) return;
      const s = useGame.getState(), reduced = s.reduced;
      const onBtn = (e.target as HTMLElement)?.tagName === 'BUTTON';

      if (e.code === 'Digit1') { e.preventDefault(); switchDemoMode('clash'); return; }
      if (e.code === 'Digit2') { e.preventDefault(); switchDemoMode('sigil'); return; }
      if (e.code === 'Digit3') { e.preventDefault(); switchDemoMode('dive'); return; }

      if (e.code === 'Space' && !onBtn) {
        e.preventDefault();
        stopTrackpad(); runtime.landGoal = null;
        const nextFly = !s.flying;
        runtime.velocity.y = nextFly ? 8 : -12;
        useGame.setState({ flying: nextFly, landing: false });
        if (nextFly) gowRuntime.lastMoveLabel = 'SKY STANCE • ON WING';
        return;
      }

      if (e.code === 'KeyX') { e.preventDefault(); executeTurnCommand('end', reduced); return; }

      if (s.flying) {
        switch (e.code) {
          case 'KeyJ': e.preventDefault(); if (!executeModeCommand(1, reduced)) triggerAerialSwoop(reduced); break;
          case 'KeyK': case 'KeyQ': case 'KeyG': e.preventDefault(); if (!executeModeCommand(2, reduced)) triggerSkySwordBeam(reduced); break;
          case 'KeyC': e.preventDefault(); runtime.landGoal = null; runtime.velocity.y = -12; useGame.setState({ flying: false, landing: false }); break;
          case 'ShiftLeft': case 'ShiftRight': e.preventDefault(); triggerDodgeRoll(reduced); break;
          case 'KeyV': e.preventDefault(); if (!executeModeCommand(4, reduced)) triggerWingedRage(reduced); break;
          default: break;
        }
        return;
      }

      switch (e.code) {
        case 'KeyJ': e.preventDefault(); if (!executeModeCommand(1, reduced)) triggerLightAttack(reduced); break;
        case 'KeyK': e.preventDefault(); triggerHeavyBash(reduced); break;
        case 'KeyQ': e.preventDefault(); if (!executeModeCommand(2, reduced)) triggerParry(reduced); break;
        case 'KeyC': case 'ShiftLeft': case 'ShiftRight': e.preventDefault(); triggerDodgeRoll(reduced); break;
        case 'KeyG': e.preventDefault(); triggerRunicSpell(reduced); break;
        case 'KeyV': e.preventDefault(); if (!executeModeCommand(4, reduced)) triggerWingedRage(reduced); break;
        case 'KeyE':
          if (!s.nearTerminal) {
            if (!triggerStunExecute(reduced)) executeTurnCommand('end', reduced);
            e.preventDefault();
          }
          break;
        default: break;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!canAct()) return;
      if (e.pointerType === 'mouse' || gowRuntime.sigilSwipeActive) {
        const pt = updateCursorPlane(e.clientX, e.clientY);
        if (pt && gowRuntime.sigilSwipeActive) {
          gowRuntime.sigilEndX = pt.x; gowRuntime.sigilEndZ = pt.z; gowRuntime.sigilRibbonTimer = 0.25;
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!canAct()) return;
      const s = useGame.getState(), reduced = s.reduced;
      if (e.target instanceof HTMLElement) {
        if (e.target.closest('[data-testid="fire-button"]')) {
          if (!executeModeCommand(1, reduced)) triggerLightAttack(reduced);
          return;
        }
        if (e.target.closest('[data-testid="aim-button"]')) {
          executeModeCommand(2, reduced);
          return;
        }
      }
      if (isHudOrButton(e.target)) return;
      const pt = updateCursorPlane(e.clientX, e.clientY);
      if (gowRuntime.demoMode === 'sigil' && gowRuntime.turnPhase === 'PLAYER_TURN' && pt && (e.pointerType !== 'mouse' || e.button === 0)) {
        Object.assign(gowRuntime, { sigilSwipeActive: true, sigilStartX: pt.x, sigilStartZ: pt.z, sigilEndX: pt.x, sigilEndZ: pt.z, sigilRibbonTimer: 0.25 });
        return;
      }
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) {
        if (!executeModeCommand(1, reduced)) { if (s.flying) triggerAerialSwoop(reduced); else triggerLightAttack(reduced); }
      } else if (e.button === 2) {
        e.preventDefault();
        if (!executeModeCommand(2, reduced)) { if (s.flying) triggerSkySwordBeam(reduced); else triggerParry(reduced); }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!gowRuntime.sigilSwipeActive) return;
      gowRuntime.sigilSwipeActive = false;
      const pt = updateCursorPlane(e.clientX, e.clientY);
      if (pt) { gowRuntime.sigilEndX = pt.x; gowRuntime.sigilEndZ = pt.z; }
      const reduced = useGame.getState().reduced;
      const dist = Math.hypot(gowRuntime.sigilEndX - gowRuntime.sigilStartX, gowRuntime.sigilEndZ - gowRuntime.sigilStartZ);
      if (dist >= 1.2) {
        handleSigilSwipe(gowRuntime.sigilStartX, gowRuntime.sigilStartZ, gowRuntime.sigilEndX, gowRuntime.sigilEndZ, reduced);
      } else if (e.pointerType === 'mouse' && e.button === 0) {
        executeModeCommand(1, reduced);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!isHudOrButton(e.target) && canAct()) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);
}
