// Digit keys 1-8 switch controls on desktop (the sheet's order), plus the pure rules. Loaded only with the lazy ControlsEntry chunk.
import { useEffect } from 'react';
import { controlsFor, type ControlFamily, type ControlId } from '@/game/controlTypes';
import { useGame } from '@/game/store';
import { currentFamily } from './family';
import { keysEnabled } from './keysPref';
import { selectControl } from './selectControl';

export type ControlKeyEvent = { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  target: EventTarget | null };
export type ControlKeyCtx = { started: boolean; panel: boolean; journal: boolean; voteOpen: boolean };
type TargetLike = { tagName?: string; isContentEditable?: boolean; closest?: (sel: string) => unknown };

/** A typing field, an editable element, or anything inside a dialog: the digit belongs there, not to the controls. */
function typingTarget(target: EventTarget | null): boolean {
  const t = target as TargetLike | null;
  if (!t || typeof t !== 'object') return false;
  if (typeof t.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName.toUpperCase())) return true;
  if (t.isContentEditable) return true;
  return typeof t.closest === 'function' && !!t.closest('[role="dialog"],dialog,[contenteditable=""],[contenteditable="true"]');
}

/** Digit1-9 and Numpad1-9 as a zero-based index below `n`, else null. */
export function digitIndex(code: string, n: number): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < n ? i : null;
}

/**
 * The control a key selects, or null. Desktop only, started, no panel, guide or vote card, not a repeat, no modifier, not a typing
 * field or dialog, and the shortcut preference on (`enabled`).
 */
export function controlKeyFor(e: ControlKeyEvent, ctx: ControlKeyCtx, family: ControlFamily, enabled: boolean): ControlId | null {
  if (!enabled || family !== 'desktop' || !ctx.started || ctx.panel || ctx.journal || ctx.voteOpen) return null;
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  const list = controlsFor('desktop'), i = digitIndex(e.code, list.length);
  if (i === null || typingTarget(e.target)) return null;
  return list[i].id;
}

/** One window keydown; a no-op on touch or with the preference off. Family and preference are read when the key is pressed. */
export function useControlKeys() {
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const g = useGame.getState(), family = currentFamily();
      const id = controlKeyFor(e, { started: g.started, panel: g.panel, journal: g.journal, voteOpen: g.voteOpen }, family, keysEnabled());
      if (!id) return;
      e.preventDefault();
      selectControl(id, { family });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
}
